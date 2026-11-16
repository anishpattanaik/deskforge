"""CadQuery geometry: Layout -> solid -> STL.

Construction:
  1. One outer block per pocket (pocket + wall on every side, height = floor +
     wall height). Neighbouring blocks overlap by exactly one wall, so walls
     are shared after the union.
  2. Each pocket interior is cut out with rounded vertical and bottom edges
     (finger-friendly scoops).
  3. Labels are engraved 0.6 mm into each pocket floor.
  4. A cable rail along the back gets snap-in clips: a round hole slightly
     larger than the cable plus a narrower mouth from the top, so the cable
     clicks in and stays.

Every cosmetic step (fillets, text) is wrapped so a kernel failure degrades
the model instead of failing the request.
"""

from __future__ import annotations

import logging
import math
from pathlib import Path

import cadquery as cq

from .errors import GenerationError
from .layout import Layout
from .schemas import OrganizerSettings

log = logging.getLogger("deskforge.cad")

ENGRAVE_DEPTH = 0.6
PLA_DENSITY = 1.24  # g/cm^3
INFILL_FACTOR = 0.55  # rough: walls are solid, floors are partly infill


def _box(x: float, y: float, z: float, w: float, d: float, h: float) -> cq.Workplane:
    return cq.Workplane("XY").add(cq.Solid.makeBox(w, d, h, pnt=cq.Vector(x, y, z)))


def _pocket_cutter(x, y, z, w, d, h, r) -> cq.Workplane:
    cutter = cq.Workplane("XY").box(w, d, h, centered=False).translate((x, y, z))
    r = min(r, w / 2 - 0.2, d / 2 - 0.2, h / 2 - 0.2)
    if r > 0.3:
        try:
            cutter = cutter.edges("not >Z").fillet(r)
        except Exception:  # noqa: BLE001 - kernel failures are cosmetic here
            log.info("pocket fillet failed; using sharp corners")
    return cutter


def _label_solid(text: str, cx: float, cy: float, z: float, w: float, d: float):
    """Engraving solid for a label centred on a pocket floor."""
    vertical = d > w * 1.3  # run text along the long side
    span, cross = (d, w) if vertical else (w, d)
    size = min(cross * 0.35, (span * 0.85) / max(len(text) * 0.62, 1), 9.0)
    if size < 2.5:
        return None
    wp = cq.Workplane("XY", origin=(cx, cy, z - ENGRAVE_DEPTH))
    if vertical:
        wp = wp.transformed(rotate=(0, 0, 90))
    return wp.text(text, size, ENGRAVE_DEPTH + 0.05, combine=False,
                   halign="center", valign="center", kind="bold")


def build_solid(layout: Layout, s: OrganizerSettings) -> tuple[cq.Workplane, list[str]]:
    wall, floor = s.wall_mm, s.floor_mm
    warnings: list[str] = []

    body: cq.Workplane | None = None
    for p in layout.pockets:
        block = _box(p.x - wall, p.y - wall, 0, p.w + 2 * wall, p.d + 2 * wall, floor + p.wall_h)
        body = block if body is None else body.union(block)

    if layout.rail_y is not None:
        rail = _box(0, layout.rail_y, 0, layout.total_w, layout.rail_d, floor + layout.rail_h)
        body = rail if body is None else body.union(rail)

    if body is None:
        raise GenerationError("Nothing to build - select at least one item.")

    for p in layout.pockets:
        body = body.cut(_pocket_cutter(p.x, p.y, floor, p.w, p.d, p.wall_h + 1, s.corner_radius_mm))

    if layout.rail_y is not None:
        top = floor + layout.rail_h
        for slot in layout.slots:
            r = (slot.diameter_mm + 0.6) / 2
            zc = top - r - 1.4  # 1.4 mm lips above the cable hold it in
            hole = cq.Solid.makeCylinder(r, layout.rail_d + 2,
                                         pnt=cq.Vector(slot.x, layout.rail_y - 1, zc),
                                         dir=cq.Vector(0, 1, 0))
            mouth_w = max(slot.diameter_mm * 0.78, 1.2)
            mouth = cq.Solid.makeBox(mouth_w, layout.rail_d + 2, top - zc + 1,
                                     pnt=cq.Vector(slot.x - mouth_w / 2, layout.rail_y - 1, zc))
            body = body.cut(hole).cut(mouth)

    if s.corner_radius_mm > 0.3:
        try:
            body = body.edges("|Z").edges("<X or >X").edges("<Y or >Y").fillet(
                min(s.corner_radius_mm + wall, 6))
        except Exception:  # noqa: BLE001
            log.info("outer corner fillet failed; keeping square corners")

    if s.engrave_labels:
        # Build every label first, then subtract them in ONE boolean op -
        # per-label cuts were ~85% of total compile time.
        solids, failed = [], 0
        for p in layout.pockets:
            try:
                txt = _label_solid(p.label.upper()[:18], p.x + p.w / 2, p.y + p.d / 2, floor, p.w, p.d)
                if txt is not None:
                    solids.extend(txt.vals())
            except Exception:  # noqa: BLE001
                failed += 1
        if solids:
            try:
                body = body.cut(cq.Compound.makeCompound(solids), clean=False)
            except Exception:  # noqa: BLE001
                failed = len(layout.pockets)
        if failed:
            warnings.append(f"{failed} label(s) could not be engraved (font issue).")

    if s.front_text.strip():
        body, msg = _engrave_front(body, layout, s)
        if msg:
            warnings.append(msg)

    return body, warnings


def _engrave_front(body: cq.Workplane, layout: Layout, s: OrganizerSettings):
    """Engrave text into the outer front wall (y = 0), centred, reading from the front."""
    text = s.front_text.strip().upper()
    front = [p for p in layout.pockets if p.y <= s.wall_mm + 0.01]
    if not front:
        return body, "Front text skipped: no front wall found."
    face_h = min(s.floor_mm + p.wall_h for p in front)
    size = min(face_h * 0.55, 12.0, (layout.total_w * 0.85) / max(len(text) * 0.68, 1))
    if size < 3:
        return body, "Front text skipped: the front wall is too low or the text too long."
    depth = min(0.8, s.wall_mm * 0.45)
    try:
        # The XZ plane's normal points -Y, so a negative distance cuts into the wall (+Y).
        txt = cq.Workplane("XZ", origin=(layout.total_w / 2, 0, face_h / 2)).text(
            text, size, -depth, combine=False, halign="center", valign="center", kind="bold")
        return body.cut(txt, clean=False), None
    except Exception:  # noqa: BLE001
        log.info("front text engraving failed")
        return body, "Front text could not be engraved (font issue)."


def export_stl(body: cq.Workplane, path: Path) -> dict:
    try:
        cq.exporters.export(body, str(path), exportType="STL", tolerance=0.05, angularTolerance=0.15)
    except Exception as exc:  # noqa: BLE001
        raise GenerationError("Failed to write the STL file.", str(exc)[:200]) from exc

    shape = body.val()
    bb = shape.BoundingBox()
    volume_cm3 = shape.Volume() / 1000.0
    size = path.stat().st_size
    triangles = max(0, (size - 84) // 50)  # binary STL: 84-byte header + 50 bytes/triangle
    if triangles == 0 or not math.isfinite(volume_cm3):
        raise GenerationError("The generated model is empty.", "Try larger pockets or fewer items.")
    return {
        "size_mm": (round(bb.xlen, 1), round(bb.ylen, 1), round(bb.zlen, 1)),
        "volume_cm3": round(volume_cm3, 1),
        "est_filament_g": round(volume_cm3 * PLA_DENSITY * INFILL_FACTOR, 0),
        "triangle_count": int(triangles),
    }
