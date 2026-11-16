"""Natural-language CAD changes: "make the walls taller", "engrave APEX on the front"...

The AI never writes geometry. It translates the request into edits of the same
parameters the sliders control (settings + per-item/cable operations), and the
normal CAD pipeline rebuilds the model. That keeps every result printable, and
anything that can't be expressed is reported back instead of silently ignored.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from . import local_vision, vision
from .errors import VisionAuthError, VisionError
from .local_vision import _inline_refs
from .schemas import OrganizerSettings

log = logging.getLogger("deskforge.edit")

# ---------------------------------------------------------------- request / response


class EditableItem(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(max_length=40)
    length_mm: float
    width_mm: float
    height_mm: float
    quantity: int = 1
    include: bool = True


class EditableCable(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(max_length=40)
    diameter_mm: float
    count: int = 1
    include: bool = True


class EditRequest(BaseModel):
    prompt: str = Field(min_length=2, max_length=300)
    items: list[EditableItem] = Field(max_length=40)
    cables: list[EditableCable] = Field(default_factory=list, max_length=20)
    settings: OrganizerSettings


class EditResponse(BaseModel):
    items: list[EditableItem]
    cables: list[EditableCable]
    settings: OrganizerSettings
    explanation: list[str]
    unsupported: list[str]
    provider: str
    seconds: float


# ---------------------------------------------------------------- model output schema


class ItemOp(BaseModel):
    action: Literal["update", "add", "remove"]
    id: str
    label: str
    length_mm: float
    width_mm: float
    height_mm: float
    quantity: int
    include: bool


class CableOp(BaseModel):
    action: Literal["update", "add", "remove"]
    id: str
    label: str
    diameter_mm: float
    count: int
    include: bool


class SettingsOut(BaseModel):
    wall_mm: float
    floor_mm: float
    clearance_mm: float
    wall_height_ratio: float
    max_width_mm: float
    corner_radius_mm: float
    engrave_labels: bool
    cable_rail: bool
    front_text: str


class EditPlan(BaseModel):
    settings: SettingsOut
    item_ops: list[ItemOp]
    cable_ops: list[CableOp]
    explanation: list[str]
    unsupported: list[str]


SYSTEM_PROMPT = """You edit a parametric, 3D-printed desk organizer tray. You get the current \
design as JSON plus a change request, and express the change ONLY through these controls.

settings (return the FULL object - copy every value you don't change):
- wall_mm 1.2-5: wall thickness.  floor_mm 1.2-5: floor thickness.
- clearance_mm 0-15: gap added around each item in its pocket (looser/tighter fit).
- wall_height_ratio 0.2-1.2: pocket wall height as a fraction of each item's height \
(taller/deeper pockets = higher ratio).
- max_width_mm 80-400: printer bed size; the layout packs to fit it.
- corner_radius_mm 0-10: rounded corners.  engrave_labels: item names engraved in pocket floors.
- cable_rail: row of snap-in cable clips along the back.
- front_text: text engraved on the front face, max 24 characters ("" for none).

item_ops / cable_ops - include ONLY things that change:
- "update": existing id, with ALL fields (copy unchanged values).
- "add": id "" and all fields (dimensions in mm: length = longest side, height = how tall).
- "remove": existing id (other fields may be copied).
- include=false keeps an item listed but removes its pocket.

Make ONE op for EVERY item the request mentions. Example - request "fit 4 pens and add a \
spot for my watch" with existing item {"id":"item-1","label":"Pens","quantity":2,...} gives \
item_ops: [{"action":"update","id":"item-1","label":"Pens","length_mm":142,"width_mm":11,\
"height_mm":11,"quantity":4,"include":true}, {"action":"add","id":"","label":"Watch",\
"length_mm":45,"width_mm":40,"height_mm":12,"quantity":1,"include":true}].

Pockets are placed automatically, so exact positions, extra compartments without an item, \
hinges, lids, colours or materials are NOT possible: put those in unsupported (short phrases) \
and do the closest sensible supported change, if any.
explanation: 1-4 short sentences saying what you changed, with numbers."""

_SETTING_NAMES = {"wall_mm": ("Wall thickness", "mm"), "floor_mm": ("Floor thickness", "mm"),
                  "clearance_mm": ("Clearance", "mm"), "max_width_mm": ("Bed size", "mm"),
                  "corner_radius_mm": ("Corner radius", "mm")}


def describe_changes(req: "EditRequest", items, cables, settings) -> list[str]:
    """What ACTUALLY changed, computed from the before/after parameters - never trusts the
    model's own summary (small models sometimes claim changes they didn't make)."""
    out: list[str] = []
    old, new = req.settings, settings
    for key, (name, unit) in _SETTING_NAMES.items():
        a, b = getattr(old, key), getattr(new, key)
        if abs(a - b) > 1e-6:
            out.append(f"{name} {a:g} → {b:g} {unit}")
    if abs(old.wall_height_ratio - new.wall_height_ratio) > 1e-6:
        out.append(f"Pocket wall height {old.wall_height_ratio:.0%} → {new.wall_height_ratio:.0%} "
                   "of item height")
    for key, name in (("engrave_labels", "Engraved labels"), ("cable_rail", "Cable rail")):
        if getattr(old, key) != getattr(new, key):
            out.append(f"{name} {'on' if getattr(new, key) else 'off'}")
    if old.front_text != new.front_text:
        out.append(f"Front engraving: “{new.front_text}”" if new.front_text else "Front engraving removed")

    before = {i.id: i for i in req.items}
    after = {i.id: i for i in items}
    for i in req.items:
        if i.id not in after:
            out.append(f"Removed {i.label}")
    for i in items:
        if i.id not in before:
            out.append(f"Added {i.label} ({i.length_mm:g}×{i.width_mm:g}×{i.height_mm:g} mm"
                       + (f", ×{i.quantity}" if i.quantity > 1 else "") + ")")
            continue
        o, bits = before[i.id], []
        if o.quantity != i.quantity:
            bits.append(f"quantity {o.quantity} → {i.quantity}")
        for f, short in (("length_mm", "length"), ("width_mm", "width"), ("height_mm", "height")):
            if abs(getattr(o, f) - getattr(i, f)) > 0.05:
                bits.append(f"{short} {getattr(o, f):g} → {getattr(i, f):g} mm")
        if o.include != i.include:
            bits.append("pocket added" if i.include else "pocket removed")
        if o.label != i.label:
            bits.append(f"renamed to {i.label}")
        if bits:
            out.append(f"{o.label}: " + ", ".join(bits))

    cb, ca = {c.id: c for c in req.cables}, {c.id: c for c in cables}
    for c in req.cables:
        if c.id not in ca:
            out.append(f"Removed {c.label} clip(s)")
    for c in cables:
        if c.id not in cb:
            out.append(f"Added {c.count}× {c.label} clip ({c.diameter_mm:g} mm)")
        else:
            o = cb[c.id]
            if (o.count, o.diameter_mm, o.include) != (c.count, c.diameter_mm, c.include):
                out.append(f"{o.label} clips: {o.count}×{o.diameter_mm:g} mm → "
                           f"{c.count}×{c.diameter_mm:g} mm" + ("" if c.include else " (off)"))
    return out

_LIMITS = {"item_ops": 15, "cable_ops": 8, "explanation": 4, "unsupported": 3}


def _local_schema() -> dict:
    schema = _inline_refs(EditPlan.model_json_schema())
    props = schema["properties"]
    for key, n in _LIMITS.items():
        props[key]["maxItems"] = n
    for key in ("explanation", "unsupported"):
        props[key]["items"]["maxLength"] = 140
    props["settings"]["properties"]["front_text"]["maxLength"] = 24
    for op in ("item_ops", "cable_ops"):
        props[op]["items"]["properties"]["label"]["maxLength"] = 40
        props[op]["items"]["properties"]["id"]["maxLength"] = 64
    return schema


LOCAL_SCHEMA = _local_schema()


# ---------------------------------------------------------------- applying the plan

_SETTING_BOUNDS = {"wall_mm": (1.2, 5), "floor_mm": (1.2, 5), "clearance_mm": (0, 15),
                   "wall_height_ratio": (0.2, 1.2), "max_width_mm": (80, 400),
                   "corner_radius_mm": (0, 10)}


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


_GLOBAL_WORDS = ("all", "every", "each", "everything", "everyone", "items", "pockets")


def _words(text: str) -> set[str]:
    return {w for w in "".join(c.lower() if c.isalnum() else " " for c in text).split() if len(w) >= 3}


def _stem(word: str) -> str:
    """Crude stem so 'pens'/'pen', 'hinged'/'hinges' match."""
    for suffix in ("es", "ed", "s"):
        if len(word) > 4 and word.endswith(suffix):
            word = word[: -len(suffix)]
            break
    return word.rstrip("s")[:5]


def _mentioned(label: str, prompt_words: set[str]) -> bool:
    """True if any word of the item's label appears (stemmed) in the prompt."""
    stems = {_stem(w) for w in prompt_words}
    return any(_stem(w) in stems for w in _words(label))


def relevant_unsupported(prompt: str, notes: list[str]) -> list[str]:
    """Keep only 'not possible' notes about something the user actually asked for -
    small models sometimes invent unrelated ones (e.g. 'hinges' when nobody asked)."""
    stems = {_stem(w) for w in _words(prompt) if len(w) >= 4}
    empty = ("no ", "none", "n/a", "nothing", "not applicable", "no changes", "all ")
    return [n.strip() for n in notes
            if n.strip() and not n.strip().lower().startswith(empty)
            and any(_stem(w) in stems for w in _words(n) if len(w) >= 4)]


_ADD_WORDS = {"add", "another", "new", "extra", "also"}


def apply_plan(req: EditRequest, plan: EditPlan) -> tuple[list[EditableItem], list[EditableCable],
                                                           OrganizerSettings, list[str]]:
    notes: list[str] = []
    prompt_words = _words(req.prompt)
    global_request = bool(prompt_words & set(_GLOBAL_WORDS))
    cable_request = bool(prompt_words & {"cable", "cables", "clip", "clips", "cord", "cords",
                                         "wire", "wires", "rail"})
    raw = plan.settings.model_dump()
    for key, (lo, hi) in _SETTING_BOUNDS.items():
        raw[key] = round(_clamp(float(raw[key]), lo, hi), 2)
    raw["front_text"] = raw["front_text"].strip()[:24]
    settings = OrganizerSettings(**raw)

    items = {it.id: it.model_copy() for it in req.items}
    order = [it.id for it in req.items]
    for op in plan.item_ops:
        fields = dict(label=(op.label or "Item").strip()[:40] or "Item",
                      length_mm=round(_clamp(op.length_mm, 5, 300), 1),
                      width_mm=round(_clamp(op.width_mm, 3, 300), 1),
                      height_mm=round(_clamp(op.height_mm, 1, 200), 1),
                      quantity=int(_clamp(op.quantity, 1, 12)), include=op.include)
        if op.action in ("remove", "update") and op.id in items:
            # Guard against side effects: only touch items the request is about.
            # A general request ("deeper pockets") may update items, never delete them.
            named = _mentioned(items[op.id].label, prompt_words)
            if not (named or (global_request and op.action == "update" and op.include)):
                log.info("ignored %s of unmentioned item %r", op.action, items[op.id].label)
                continue
        if op.action == "remove":
            if op.id in items:
                del items[op.id]
                order.remove(op.id)
        elif op.action == "update" and op.id in items:
            items[op.id] = EditableItem(id=op.id, **fields)
        else:  # add, or update of an unknown id
            new_id = f"ai-{uuid.uuid4().hex[:8]}"
            items[new_id] = EditableItem(id=new_id, **fields)
            order.append(new_id)

    cables = {c.id: c.model_copy() for c in req.cables}
    corder = [c.id for c in req.cables]
    for op in plan.cable_ops:
        fields = dict(label=(op.label or "Cable").strip()[:40] or "Cable",
                      diameter_mm=round(_clamp(op.diameter_mm, 1.5, 15), 1),
                      count=int(_clamp(op.count, 1, 12)), include=op.include)
        if op.action in ("remove", "update") and op.id in cables and not (
                cable_request or global_request or _mentioned(cables[op.id].label, prompt_words)):
            continue
        if op.id not in cables and not cable_request:
            continue  # never invent new cable clips unless the request is about cables
        if op.action == "remove":
            if op.id in cables:
                del cables[op.id]
                corder.remove(op.id)
        elif op.action == "update" and op.id in cables:
            cables[op.id] = EditableCable(id=op.id, **fields)
        else:
            new_id = f"ai-cable-{uuid.uuid4().hex[:8]}"
            cables[new_id] = EditableCable(id=new_id, **fields)
            corder.append(new_id)

    if not any(items[i].include for i in order):
        notes.append("That would leave no pockets, so the change was not applied to items.")
        return req.items, [cables[c] for c in corder], settings, notes
    return [items[i] for i in order], [cables[c] for c in corder], settings, notes


def _user_message(req: EditRequest) -> str:
    design = {"settings": req.settings.model_dump(),
              "items": [i.model_dump() for i in req.items],
              "cables": [c.model_dump() for c in req.cables]}
    return f"Current design:\n{json.dumps(design)}\n\nChange request: {req.prompt.strip()}"


def _local_plan(user: str) -> tuple[EditPlan, float]:
    content, seconds = local_vision.chat_json(SYSTEM_PROMPT, user, LOCAL_SCHEMA,
                                              num_predict=1500, what="edit")
    try:
        return EditPlan.model_validate_json(content), seconds
    except ValidationError as exc:
        log.warning("local edit returned invalid JSON: %s", content[:300])
        raise VisionError("The local AI returned an unexpected format.",
                          "Try rephrasing the request.") from exc


def run_edit(req: EditRequest) -> EditResponse:
    provider = vision.active_provider()
    user = _user_message(req)
    if provider == "claude":
        t0 = time.perf_counter()
        plan = vision.claude_parse(SYSTEM_PROMPT, user, EditPlan, effort="low",
                                   what="this change request")
        seconds = time.perf_counter() - t0
    elif provider == "local":
        plan, seconds = _local_plan(user)
        # Small models sometimes skip the "add" op while still claiming they added it.
        wants_add = bool(_words(req.prompt) & _ADD_WORDS)
        if wants_add and not any(op.action == "add" for op in plan.item_ops):
            log.info("edit asked to add but plan has no add op; retrying once")
            plan2, s2 = _local_plan(user + "\n\nReminder: this request asks to ADD a new item. "
                                    "Include an item_ops entry with action \"add\" for it.")
            seconds += s2
            if any(op.action == "add" for op in plan2.item_ops):
                plan = plan2
    else:
        raise VisionAuthError("Changes by prompt need an AI.",
                              "Start Ollama for the free local AI, or add an ANTHROPIC_API_KEY.")

    items, cables, settings, notes = apply_plan(req, plan)
    explanation = describe_changes(req, items, cables, settings) + notes
    if not explanation:
        explanation = ["Nothing changed - try describing the change more specifically."]
    return EditResponse(items=items, cables=cables, settings=settings, explanation=explanation,
                        unsupported=relevant_unsupported(req.prompt, plan.unsupported),
                        provider=provider, seconds=round(seconds, 1))
