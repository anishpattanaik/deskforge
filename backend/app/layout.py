"""Turns a list of items + cables into a 2D tray layout (pure Python, no CAD).

Coordinates are in millimetres, origin at the tray's front-left-bottom corner,
X to the right, Y away from the user (towards the back), Z up.

Algorithm (shelf packing, good enough for <= 30 pockets):
  1. Each item becomes a pocket: width = item width * quantity + clearance,
     depth = item length + clearance, wall height = item height * ratio.
  2. Pockets are sorted by depth and packed left-to-right into rows that are
     no wider than the printer bed.
  3. Every row is stretched to the widest row, and every pocket to its row's
     depth, so the result is a clean rectangle with shared walls.
  4. An optional cable rail with snap-in clips is added along the back edge.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .schemas import OrganizerCable, OrganizerItem, OrganizerSettings

MIN_WALL_H = 12.0
MAX_WALL_H = 80.0
SLOT_GAP = 6.0  # material between two cable clips


@dataclass
class Pocket:
    id: str
    label: str
    x: float  # interior min corner
    y: float
    w: float  # interior size
    d: float
    wall_h: float  # height of walls above the floor


@dataclass
class CableSlot:
    label: str
    x: float  # slot centre
    diameter_mm: float


@dataclass
class Layout:
    pockets: list[Pocket]
    slots: list[CableSlot]
    total_w: float
    total_d: float
    rail_y: float | None = None  # front face of the rail
    rail_d: float = 0.0
    rail_h: float = 0.0
    warnings: list[str] = field(default_factory=list)


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def plan_layout(items: list[OrganizerItem], cables: list[OrganizerCable],
                s: OrganizerSettings) -> Layout:
    warnings: list[str] = []
    wall = s.wall_mm
    usable_w = s.max_width_mm - 2 * wall

    # Pocket footprint with the item's long side running front-to-back.
    base = []
    for it in items:
        length, width = max(it.length_mm, it.width_mm), min(it.length_mm, it.width_mm)
        w = width * it.quantity + s.clearance_mm + (it.quantity - 1) * 1.0
        d = length + s.clearance_mm
        wall_h = _clamp(it.height_mm * s.wall_height_ratio, MIN_WALL_H, MAX_WALL_H)
        base.append((it, w, d, wall_h))

    extra_d = _rail_depth(cables, wall) - wall if (s.cable_rail and cables) else 0.0
    rows = _best_packing(base, usable_w, wall, s.max_width_mm, extra_d)
    for row in rows:
        for it, w, _d, _h in row:
            if w > usable_w + 1e-6:
                warnings.append(f"'{it.label}' is wider than the bed.")

    target_w = max(_row_width(r, wall) for r in rows)

    pockets: list[Pocket] = []
    y = wall
    for row in rows:
        depth = max(e[2] for e in row)
        extra = target_w - _row_width(row, wall)
        base = sum(e[1] for e in row)
        x = wall
        for it, w, _d, wall_h in row:
            w_final = w + extra * (w / base)  # stretch proportionally
            pockets.append(Pocket(id=it.id, label=it.label, x=round(x, 3), y=round(y, 3),
                                  w=round(w_final, 3), d=round(depth, 3),
                                  wall_h=round(wall_h, 3)))
            x += w_final + wall
        y += depth + wall

    total_w = target_w + 2 * wall
    total_d = y

    layout = Layout(pockets=pockets, slots=[], total_w=round(total_w, 3),
                    total_d=round(total_d, 3), warnings=warnings)

    if s.cable_rail and cables:
        _add_cable_rail(layout, cables, s)

    if layout.total_d > s.max_width_mm:
        layout.warnings.append(
            f"Tray is {layout.total_d:.0f} mm deep - larger than a {s.max_width_mm:.0f} mm bed. "
            "Untick a few items or raise the bed size.")
    return layout


def _row_width(row, wall: float) -> float:
    return sum(e[1] for e in row) + wall * (len(row) - 1)


def _shelf_pack(entries, row_limit: float, wall: float):
    rows: list[list[tuple]] = []
    row_w = 0.0
    for entry in sorted(entries, key=lambda r: (-r[2], -r[1])):
        w = entry[1]
        if rows and row_w + wall + w <= row_limit:
            rows[-1].append(entry)
            row_w += wall + w
        else:
            rows.append([entry])
            row_w = w
    return rows


def _rail_depth(cables: list[OrganizerCable], wall: float) -> float:
    return max(10.0, max(c.diameter_mm for c in cables) + 2 * wall + 2)


def _best_packing(base, usable_w: float, wall: float, bed: float, extra_d: float = 0.0):
    """Try orientations x row widths; keep the layout that fits the bed with least area."""
    def rotated(e):
        it, w, d, h = e
        return (it, d, w, h)

    orientations = {
        "long_y": base,
        "long_x": [rotated(e) for e in base],
        # Rotate only pockets that are much deeper than they are wide.
        "mixed": [rotated(e) if e[2] > 1.8 * e[1] and e[2] <= usable_w else e for e in base],
    }
    best, best_score = None, None
    for entries in orientations.values():
        for frac in (1.0, 0.9, 0.8, 0.7, 0.6, 0.5):
            limit = max(usable_w * frac, max(e[1] for e in entries))
            rows = _shelf_pack(entries, limit, wall)
            width = max(_row_width(r, wall) for r in rows) + 2 * wall
            depth = sum(max(e[2] for e in r) for r in rows) + wall * (len(rows) + 1) + extra_d
            overflow = max(0.0, width - bed) + max(0.0, depth - bed)
            score = (overflow, width * depth)
            if best_score is None or score < best_score:
                best, best_score = rows, score
    return best


def _add_cable_rail(layout: Layout, cables: list[OrganizerCable], s: OrganizerSettings) -> None:
    wall = s.wall_mm
    flat: list[tuple[str, float]] = []
    for c in cables:
        flat.extend((c.label, c.diameter_mm) for _ in range(c.count))
    flat.sort(key=lambda t: -t[1])

    max_d = max(d for _, d in flat)
    pitch_total = sum(d + 0.6 + SLOT_GAP for _, d in flat) + SLOT_GAP
    usable = layout.total_w
    if pitch_total > usable:
        kept, acc = [], SLOT_GAP
        for lbl, d in flat:
            if acc + d + 0.6 + SLOT_GAP > usable:
                break
            kept.append((lbl, d))
            acc += d + 0.6 + SLOT_GAP
        layout.warnings.append(
            f"Only {len(kept)} of {len(flat)} cable clips fit along the back edge.")
        flat = kept
        pitch_total = acc

    # Centre the clips along the rail.
    x = (usable - pitch_total) / 2 + SLOT_GAP
    for lbl, d in flat:
        hole = d + 0.6
        layout.slots.append(CableSlot(label=lbl, x=round(x + hole / 2, 3), diameter_mm=d))
        x += hole + SLOT_GAP

    layout.rail_y = round(layout.total_d - wall, 3)  # shares the back wall
    layout.rail_d = round(_rail_depth(cables, wall), 3)
    layout.rail_h = round(max_d + 5.0, 3)
    layout.total_d = round(layout.rail_y + layout.rail_d, 3)
