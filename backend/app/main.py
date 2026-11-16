"""DeskForge API.

    GET  /api/health             -> server + credentials status
    GET  /api/demo               -> canned analysis (demo mode)
    POST /api/analyze            -> multipart photo -> DeskAnalysis (Claude vision)
    POST /api/generate           -> reviewed params -> STL + layout metadata
    GET  /api/models/{id}.stl    -> download a generated STL
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from . import cad, local_vision, vision
from .demo_data import DEMO_ANALYSIS
from .errors import (AppError, GenerationError, NotFoundError, VisionAuthError,
                     install_error_handlers)
from .edit import EditRequest, EditResponse, run_edit
from .layout import plan_layout
from .limits import cad_slot, check_ai, check_cad
from .reference import DEFAULT_KEY as DEFAULT_REF_KEY
from .reference import PRESETS as REFERENCE_PRESETS
from .reference import apply_reference, prompt_hint, resolve_reference
from .schemas import (AnalyzeResponse, GenerateRequest, GenerateResponse, PocketOut,
                      SlotOut)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("deskforge")

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "generated"
OUT_DIR.mkdir(exist_ok=True)
FRONTEND_DIST = ROOT.parent / "frontend" / "dist"
KEEP_MODELS = 40
MODEL_ID_RE = re.compile(r"^[a-f0-9]{32}$")

app = FastAPI(title="DeskForge", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
install_error_handlers(app)


def _model_for(provider: str) -> str | None:
    return {"claude": vision.MODEL, "local": local_vision.LOCAL_MODEL}.get(provider)


@app.get("/api/health")
def health():
    provider = vision.active_provider()
    return {"ok": True, "provider": provider, "vision_model": _model_for(provider),
            "credentials": vision.has_credentials(), "local": local_vision.local_status()}


@app.get("/api/references")
def references():
    return {"default": DEFAULT_REF_KEY,
            "presets": [{"key": r.key, "name": r.name, "length_mm": r.length_mm,
                         "width_mm": r.width_mm} for r in REFERENCE_PRESETS.values()]}


@app.get("/api/demo", response_model=AnalyzeResponse)
def demo():
    return AnalyzeResponse(source="demo", analysis=DEMO_ANALYSIS.model_copy(deep=True),
                           warnings=["Demo mode: using a sample desk analysis."])


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: Request,
    file: UploadFile = File(...),
    demo_fallback: bool = Query(False),
    ref_key: str = Form(DEFAULT_REF_KEY),
    ref_name: str | None = Form(None),
    ref_length_mm: float | None = Form(None),
    ref_width_mm: float | None = Form(None),
):
    if ref_key == "custom":
        if not (ref_name and ref_name.strip()):
            raise AppError("Give your reference object a name.", "e.g. 'TV remote' or 'my phone'.",
                           code="invalid_reference", status_code=400)
        for v in (ref_length_mm, ref_width_mm):
            if v is None or not 5 <= v <= 400:
                raise AppError("Reference size must be between 5 and 400 mm.",
                               "Measure the object's length and width with a ruler.",
                               code="invalid_reference", status_code=400)
    elif ref_key != "auto" and ref_key not in REFERENCE_PRESETS:
        raise AppError(f"Unknown reference object '{ref_key}'.", code="invalid_reference",
                       status_code=400)
    ref = resolve_reference(ref_key, ref_name, ref_length_mm, ref_width_mm)
    hint = prompt_hint(ref)

    data = await file.read()
    image_b64, media_type = vision.prepare_image(data, file.content_type)

    provider = vision.active_provider()
    if provider == "demo":
        if demo_fallback:
            return AnalyzeResponse(
                source="demo", analysis=DEMO_ANALYSIS.model_copy(deep=True),
                warnings=["No API key and no local AI available - showing the demo analysis."])
        raise VisionAuthError("No vision AI is available.",
                              "Add an ANTHROPIC_API_KEY, or start Ollama for the free local model.")

    check_ai(request)  # public deployment: per-visitor + daily AI limits
    # Both providers block; run them off the event loop.
    try:
        if provider == "local":
            analysis = await run_in_threadpool(local_vision.analyze_desk_local, image_b64, hint)
            analysis = vision.normalize_analysis(analysis)
        else:
            analysis = await run_in_threadpool(vision.analyze_desk, image_b64, media_type, hint)
        analysis = apply_reference(analysis, ref)
    except AppError:
        if demo_fallback:
            log.exception("vision failed; falling back to demo data")
            return AnalyzeResponse(source="demo", analysis=DEMO_ANALYSIS.model_copy(deep=True),
                                   warnings=["Vision call failed - showing the demo analysis."])
        raise

    warnings = []
    if not analysis.reference_object.detected:
        what = f"your {ref.name}" if ref else "a scale reference"
        warnings.append(f"Couldn't find {what} in the photo - sizes are estimates. "
                        "Check the sliders, or retake with the reference clearly visible.")
    if not any(i.include_in_organizer for i in analysis.items):
        warnings.append("No organizer-sized items were detected.")
    return AnalyzeResponse(source=provider, model=_model_for(provider), analysis=analysis,
                           warnings=warnings)


@app.post("/api/edit", response_model=EditResponse)
def edit(req: EditRequest, request: Request):
    """Natural-language change request -> updated parameters (the client then regenerates)."""
    check_ai(request)
    return run_edit(req)


@app.post("/api/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest, request: Request):
    check_cad(request)
    t0 = time.perf_counter()
    layout = plan_layout(req.items, req.cables, req.settings)
    try:
        with cad_slot():  # at most N heavy CAD builds at once
            body, cad_warnings = cad.build_solid(layout, req.settings)
    except AppError:
        raise
    except Exception as exc:  # noqa: BLE001 - OCC kernel errors are opaque
        log.exception("CAD build failed")
        raise GenerationError("The CAD kernel could not build this layout.",
                              "Try a larger clearance or fewer items.") from exc

    model_id = uuid.uuid4().hex
    path = OUT_DIR / f"{model_id}.stl"
    stats = cad.export_stl(body, path)
    _prune_old_models()

    return GenerateResponse(
        model_id=model_id,
        stl_url=f"/api/models/{model_id}.stl",
        generation_ms=int((time.perf_counter() - t0) * 1000),
        pockets=[PocketOut(**p.__dict__) for p in layout.pockets],
        slots=[SlotOut(**s.__dict__) for s in layout.slots],
        rail_y=layout.rail_y,
        warnings=layout.warnings + cad_warnings,
        **stats,
    )


@app.get("/api/models/{model_id}.stl")
def download(model_id: str):
    if not MODEL_ID_RE.match(model_id):
        raise NotFoundError("Unknown model id.")
    path = OUT_DIR / f"{model_id}.stl"
    if not path.exists():
        raise NotFoundError("That model has expired.", "Click Generate again.")
    return FileResponse(path, media_type="model/stl",
                        filename=f"deskforge-organizer-{model_id[:6]}.stl")


def _prune_old_models() -> None:
    files = sorted(OUT_DIR.glob("*.stl"), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in files[KEEP_MODELS:]:
        old.unlink(missing_ok=True)


# Serve the built frontend (npm run build) from the same origin, if present.
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
