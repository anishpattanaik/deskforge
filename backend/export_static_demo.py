"""Pre-build the demo organizer for the static (GitHub Pages) website.

The static site has no server, so the 3D story and demo viewer load these files:
    frontend/public/demo/analysis.json   - the demo desk analysis (same shape as /api/demo)
    frontend/public/demo/model.json      - the generated model metadata (same shape as /api/generate)
    frontend/public/demo/organizer.stl   - the generated STL

Run after changing the CAD code:   python export_static_demo.py
"""

import json
import time
from pathlib import Path

from app import cad
from app.demo_data import DEMO_ANALYSIS
from app.layout import plan_layout
from app.schemas import (AnalyzeResponse, GenerateResponse, OrganizerCable, OrganizerItem,
                         OrganizerSettings, PocketOut, SlotOut)

OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "demo"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    analysis = AnalyzeResponse(source="demo", analysis=DEMO_ANALYSIS,
                               warnings=["Demo mode: using a sample desk analysis."])
    (OUT / "analysis.json").write_text(analysis.model_dump_json(indent=1), encoding="utf-8")

    items = [OrganizerItem(id=f"d{n}", label=i.name, length_mm=i.length_mm, width_mm=i.width_mm,
                           height_mm=i.height_mm, quantity=i.quantity)
             for n, i in enumerate(DEMO_ANALYSIS.items) if i.include_in_organizer]
    cables = [OrganizerCable(label=c.cable_type, diameter_mm=c.diameter_mm, count=c.count)
              for c in DEMO_ANALYSIS.cables]
    settings = OrganizerSettings(front_text="DESKFORGE")

    t0 = time.perf_counter()
    layout = plan_layout(items, cables, settings)
    body, warnings = cad.build_solid(layout, settings)
    stats = cad.export_stl(body, OUT / "organizer.stl")
    model = GenerateResponse(
        model_id="demo", stl_url="demo/organizer.stl",
        generation_ms=int((time.perf_counter() - t0) * 1000),
        pockets=[PocketOut(**p.__dict__) for p in layout.pockets],
        slots=[SlotOut(**s.__dict__) for s in layout.slots],
        rail_y=layout.rail_y, warnings=layout.warnings + warnings, **stats)
    (OUT / "model.json").write_text(model.model_dump_json(indent=1), encoding="utf-8")
    size_kb = (OUT / "organizer.stl").stat().st_size // 1024
    print(f"wrote {OUT} - {len(layout.pockets)} pockets, STL {size_kb} KB, {model.generation_ms} ms")


if __name__ == "__main__":
    main()
