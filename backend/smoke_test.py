"""Offline end-to-end check: demo analysis -> layout -> CadQuery -> STL.

    python smoke_test.py
"""

import time
from pathlib import Path

from app import cad
from app.demo_data import DEMO_ANALYSIS
from app.layout import plan_layout
from app.schemas import OrganizerCable, OrganizerItem, OrganizerSettings


def main() -> None:
    items = [
        OrganizerItem(id=f"i{n}", label=i.name, length_mm=i.length_mm, width_mm=i.width_mm,
                      height_mm=i.height_mm, quantity=i.quantity)
        for n, i in enumerate(DEMO_ANALYSIS.items) if i.include_in_organizer
    ]
    cables = [OrganizerCable(label=c.cable_type, diameter_mm=c.diameter_mm, count=c.count)
              for c in DEMO_ANALYSIS.cables]
    settings = OrganizerSettings()

    t0 = time.perf_counter()
    layout = plan_layout(items, cables, settings)
    print(f"layout: {len(layout.pockets)} pockets, {len(layout.slots)} clips, "
          f"{layout.total_w:.0f} x {layout.total_d:.0f} mm")
    for p in layout.pockets:
        print(f"  {p.label:<18} at ({p.x:6.1f},{p.y:6.1f})  {p.w:6.1f} x {p.d:6.1f}  h={p.wall_h:.0f}")
    body, warnings = cad.build_solid(layout, settings)
    out = Path(__file__).parent / "generated" / "smoke_test.stl"
    out.parent.mkdir(exist_ok=True)
    stats = cad.export_stl(body, out)
    print("stats:", stats)
    print("warnings:", layout.warnings + warnings)
    print(f"done in {time.perf_counter() - t0:.1f}s -> {out}")


if __name__ == "__main__":
    main()
