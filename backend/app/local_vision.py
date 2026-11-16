"""Free, offline vision provider: a local Ollama model (default: Qwen2.5-VL 7B).

Uses Ollama's structured outputs (`format` = JSON schema) so the response is
constrained to the same `DeskAnalysis` schema the Claude provider uses - the
rest of the pipeline can't tell the difference.

Notes from testing on an Intel Core Ultra laptop:
  * Thinking mode (where a model supports it) was ~4x slower and less reliable
    for this extraction task, so it is turned off.
  * The locally installed gemma4 build could not read images at all under
    Ollama 0.40 (even via `ollama run`), hence the Qwen2.5-VL default.
    Override with DESKFORGE_LOCAL_MODEL.
"""

from __future__ import annotations

import base64
import copy
import io
import json
import logging
import os
import socket
import time
import urllib.error
import urllib.request

from PIL import Image
from pydantic import ValidationError

from .errors import VisionError
from .schemas import DeskAnalysis

log = logging.getLogger("deskforge.local_vision")

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
if not OLLAMA_HOST.startswith("http"):
    OLLAMA_HOST = "http://" + OLLAMA_HOST
LOCAL_MODEL = os.getenv("DESKFORGE_LOCAL_MODEL", "qwen2.5vl:7b")
LOCAL_MAX_EDGE_PX = 1024  # the vision encoder downsamples anyway; smaller = faster
TIMEOUT_S = float(os.getenv("DESKFORGE_LOCAL_TIMEOUT", "300"))

# Much shorter than the Claude prompt: on CPU, reading the prompt is the slowest
# part (~24 tokens/s), so every token saved is time saved.
LOCAL_PROMPT = """Inventory the loose objects in this desk photo for a 3D-printed organizer tray. \
Reply ONLY with JSON matching the schema.
- Scale: size everything from the scale reference object (see the user message) and fill \
reference_object; if it isn't visible, use typical product sizes and set detected=false.
- Millimetres. length = longest side lying flat, width = shorter side, height = how tall it \
stands on the desk.
- Group identical objects using quantity.
- include_in_organizer = true for small items under 200 mm (mouse, phone, pens, earbuds, keys, \
USB drives, sticky notes, glasses, chargers); false for laptops, keyboards, monitors, mugs, \
papers, lamps.
- Cables go ONLY in cables (never in items), with connector type and jacket diameter \
(USB-C ~4, Lightning ~3.5, HDMI ~7.5, power ~7).
- clutter_score 0-100, 2-4 clutter_categories (severity 1-5), summary = one sentence.
- reason/description/notes: under 8 words."""

_CABLE_WORDS = ("cable", "cord", "wire", "lead")
_NOT_TRAY_WORDS = ("laptop", "keyboard", "monitor", "screen", "mug", "cup", "bottle", "glass of",
                   "paper", "notebook", "book", "lamp", "plant", "tablet", "speaker")


def tidy_local(a: DeskAnalysis) -> DeskAnalysis:
    """Fix the judgement slips small local models make (measured with qwen2.5vl:7b):
    cables listed as items, tray-sized items not marked for a pocket, and heights
    of items lying flat reported as their length."""
    kept = []
    for it in a.items:
        name = it.name.lower()
        if any(w in name for w in _CABLE_WORDS):
            continue  # cables belong in the cable rail, not in a pocket
        it.height_mm = min(it.height_mm, it.width_mm * 1.5 + 10)
        small = max(it.length_mm, it.width_mm) <= 200
        if small and not any(w in name for w in _NOT_TRAY_WORDS):
            it.include_in_organizer = True
        kept.append(it)
    a.items = kept
    return a


def _inline_refs(schema: dict) -> dict:
    """Ollama's grammar converter is happiest with a flat schema: resolve $defs/$ref."""
    defs = schema.get("$defs", {})

    def resolve(node):
        if isinstance(node, dict):
            if "$ref" in node:
                name = node["$ref"].split("/")[-1]
                return resolve(copy.deepcopy(defs[name]))
            return {k: resolve(v) for k, v in node.items() if k not in ("$defs", "title")}
        if isinstance(node, list):
            return [resolve(v) for v in node]
        return node

    return resolve(schema)


# Hard limits enforced *during generation* by Ollama's grammar (verified: it honours
# maxItems / maxLength). Without them a small model can loop - one real photo ran
# 3.5 min and 3000+ tokens without finishing. With them the worst case is ~1.5k tokens
# and the JSON is always complete.
_ARRAY_LIMITS = {"items": 12, "cables": 6, "clutter_categories": 4}
_STRING_LIMITS = {"name": 40, "summary": 220, "reason": 60, "description": 60, "notes": 60,
                  "category": 30}


def _bounded(schema: dict) -> dict:
    def walk(node):
        if isinstance(node, dict):
            props = node.get("properties")
            if isinstance(props, dict):
                for key, sub in props.items():
                    if sub.get("type") == "array" and key in _ARRAY_LIMITS:
                        sub["maxItems"] = _ARRAY_LIMITS[key]
                    if sub.get("type") == "string" and key in _STRING_LIMITS:
                        sub["maxLength"] = _STRING_LIMITS[key]
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
        return node

    return walk(schema)


SCHEMA = _bounded(_inline_refs(DeskAnalysis.model_json_schema()))


def _get(path: str, timeout: float = 2.0) -> dict:
    with urllib.request.urlopen(f"{OLLAMA_HOST}{path}", timeout=timeout) as r:
        return json.load(r)


_status_cache: dict = {"t": 0.0, "value": None}


def local_status(max_age_s: float = 10.0) -> dict:
    """{'running': bool, 'model_installed': bool} - cached briefly so /health stays fast."""
    now = time.monotonic()
    if _status_cache["value"] is not None and now - _status_cache["t"] < max_age_s:
        return _status_cache["value"]
    status = {"running": False, "model_installed": False}
    try:
        tags = _get("/api/tags")
        status["running"] = True
        names = {m.get("name", "") for m in tags.get("models", [])}
        status["model_installed"] = any(
            n == LOCAL_MODEL or n.split(":")[0] == LOCAL_MODEL.split(":")[0] for n in names)
    except (urllib.error.URLError, OSError, ValueError):
        pass
    _status_cache.update(t=now, value=status)
    return status


def local_available() -> bool:
    s = local_status()
    return s["running"] and s["model_installed"]


def _shrink(image_b64: str) -> str:
    img = Image.open(io.BytesIO(base64.b64decode(image_b64)))
    if max(img.size) <= LOCAL_MAX_EDGE_PX:
        return image_b64
    img.thumbnail((LOCAL_MAX_EDGE_PX, LOCAL_MAX_EDGE_PX))
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=88)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def chat_json(system: str, user: str, schema: dict, *, images: list[str] | None = None,
              num_predict: int = 2500, what: str = "request"):
    """One Ollama chat call constrained to `schema`. Returns (raw JSON text, seconds)."""
    status = local_status(max_age_s=0)
    if not status["running"]:
        raise VisionError("The local AI (Ollama) isn't running.",
                          "Start 'Ollama' from the Start menu, then try again.", status_code=503)
    if not status["model_installed"]:
        raise VisionError(f"The local model '{LOCAL_MODEL}' isn't installed.",
                          f"Run:  ollama pull {LOCAL_MODEL}", status_code=503)

    user_msg = {"role": "user", "content": user}
    if images:
        user_msg["images"] = images
    body = {
        "model": LOCAL_MODEL,
        "stream": False,
        "think": False,
        "format": schema,
        "keep_alive": "30m",  # keep the model in memory between requests
        # repeat_penalty discourages the "same item over and over" loops seen on real photos.
        "options": {"temperature": 0.2, "num_ctx": 8192, "num_predict": num_predict,
                    "repeat_penalty": 1.15},
        "messages": [{"role": "system", "content": system}, user_msg],
    }
    req = urllib.request.Request(f"{OLLAMA_HOST}/api/chat", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            resp = json.load(r)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:200]
        raise VisionError(f"The local model returned an error ({exc.code}).", detail) from exc
    except (socket.timeout, TimeoutError) as exc:
        raise VisionError("The local model took too long.",
                          "Close other heavy apps and try again.", status_code=504) from exc
    except (urllib.error.URLError, OSError) as exc:
        raise VisionError("Lost connection to the local AI (Ollama).",
                          "Make sure Ollama is running, then try again.", status_code=503) from exc

    seconds = time.perf_counter() - t0
    log.info("local %s: %.1fs, %s output tokens", what, seconds, resp.get("eval_count"))
    if resp.get("done_reason") == "length":
        raise VisionError("The local model's answer was cut off.", "Try again.")
    return (resp.get("message") or {}).get("content", ""), seconds


def analyze_desk_local(image_b64: str, ref_hint: str = "") -> DeskAnalysis:
    content, _ = chat_json(LOCAL_PROMPT,
                           "Analyse this desk photo and return the structured inventory." + ref_hint,
                           SCHEMA, images=[_shrink(image_b64)], what="vision")
    try:
        return tidy_local(DeskAnalysis.model_validate_json(content))
    except ValidationError as exc:
        log.warning("local model returned invalid JSON: %s", content[:300])
        raise VisionError("The local model returned an unexpected format.", "Try again.") from exc
