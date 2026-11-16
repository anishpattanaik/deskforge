"""Desk photo -> DeskAnalysis using Claude vision + structured outputs."""

from __future__ import annotations

import base64
import io
import logging
import os

import anthropic
from PIL import Image, ImageOps, UnidentifiedImageError

from .errors import (InvalidImageError, VisionAuthError, VisionError,
                     VisionRateLimitError)
from .schemas import DeskAnalysis

log = logging.getLogger("deskforge.vision")

MODEL = os.getenv("DESKFORGE_MODEL", "claude-opus-5-5")
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
MAX_EDGE_PX = 1568  # Claude's recommended long-edge size for vision
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}

SYSTEM_PROMPT = """You analyse photos of cluttered desks so a parametric CAD script can \
generate a 3D-printed organizer tray that fits the user's actual belongings.

Measurement:
- Look for a scale reference first: a credit/bank card (85.6 x 54.0 mm), A4 paper \
(297 x 210 mm), US Letter (279 x 216 mm) or a coin. If one is present, derive every \
dimension from it and report it in reference_object.
- If there is none, estimate from typical real-world sizes of recognisable products \
(e.g. a standard mouse is ~115 x 62 x 38 mm) and set reference_object.detected = false.
- All dimensions are in millimetres. length_mm is the longest side lying on the desk, \
width_mm the shorter side, height_mm how tall it stands.

Items:
- List every distinct loose object. Group identical objects with quantity (3 pens = one \
entry, quantity 3).
- include_in_organizer = true only for small items that belong in a tray pocket \
(roughly under 200 mm long): mice, phones, earbuds, pens, sticky notes, USB drives, \
keys, glasses, chargers, SD cards, etc. Set it false for monitors, laptops, keyboards, \
drinks, plants, lamps, papers and anything too large or unsuitable.
- confidence is 0-1. reason is one short sentence.

Cables:
- Identify each loose cable by connector type where visible and estimate its jacket \
diameter (typical: USB-C 3.5-4.5 mm, USB-A 3.5-4 mm, Lightning 3-3.5 mm, HDMI 7-8 mm, \
DisplayPort 6-7 mm, AC power 6-8 mm, 3.5 mm audio 3-4 mm, Ethernet 5.5-6.5 mm).

Clutter:
- clutter_score 0-100 (100 = chaos). clutter_categories groups the mess into 2-5 named \
categories with severity 1-5.
- summary is 1-2 plain sentences describing the desk.

If the photo is not of a desk or workspace, still return the schema with an empty items \
list and explain in summary."""


_client: anthropic.Anthropic | None = None


def has_credentials() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))


# auto  = Claude if a key is configured, else the free local model, else demo data
# claude / local = force one provider
PROVIDER_SETTING = os.getenv("DESKFORGE_VISION", "auto").lower()


def active_provider() -> str:
    """Returns 'claude', 'local' or 'demo'."""
    from .local_vision import local_available  # local import keeps module load light

    if PROVIDER_SETTING == "claude":
        return "claude"
    if PROVIDER_SETTING == "local":
        return "local"
    if has_credentials():
        return "claude"
    if local_available():
        return "local"
    return "demo"


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=120.0, max_retries=2)
    return _client


def prepare_image(data: bytes, content_type: str | None) -> tuple[str, str]:
    """Validate, auto-rotate and downscale the upload. Returns (base64, media_type)."""
    if not data:
        raise InvalidImageError("The uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise InvalidImageError("Image is larger than 15 MB.", "Use a smaller or compressed photo.")
    if content_type and content_type not in ALLOWED_TYPES and not content_type.startswith("image/"):
        raise InvalidImageError(f"Unsupported file type: {content_type}.", "Upload a JPG, PNG or WebP photo.")
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImageError("Could not read that file as an image.",
                                "Upload a JPG, PNG or WebP photo.") from exc
    img.thumbnail((MAX_EDGE_PX, MAX_EDGE_PX))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return base64.standard_b64encode(buf.getvalue()).decode("ascii"), "image/jpeg"


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def normalize_analysis(a: DeskAnalysis) -> DeskAnalysis:
    """Clamp model estimates into ranges the CAD stage can always build."""
    for it in a.items:
        it.quantity = int(_clamp(it.quantity, 1, 12))
        it.length_mm = round(_clamp(it.length_mm, 5, 300), 1)
        it.width_mm = round(_clamp(it.width_mm, 3, 300), 1)
        it.height_mm = round(_clamp(it.height_mm, 1, 200), 1)
        it.confidence = round(_clamp(it.confidence, 0, 1), 2)
        if it.length_mm < it.width_mm:
            it.length_mm, it.width_mm = it.width_mm, it.length_mm
    for c in a.cables:
        c.count = int(_clamp(c.count, 1, 12))
        c.diameter_mm = round(_clamp(c.diameter_mm, 1.5, 15), 1)
    for cat in a.clutter_categories:
        cat.severity = int(_clamp(cat.severity, 1, 5))
    a.clutter_score = int(_clamp(a.clutter_score, 0, 100))
    return a


def claude_parse(system: str, content, output_format, *, effort: str = "medium",
                 what: str = "this request"):
    """One structured-output call to Claude with every API failure mapped to a typed AppError."""
    client = _get_client()
    try:
        # Server-side fallback: if a safety classifier declines on the primary
        # model, the API re-runs the request on a suitable fallback model.
        response = client.beta.messages.parse(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=system,
            output_config={"effort": effort},
            messages=[{"role": "user", "content": content}],
            output_format=output_format,
        )
    except anthropic.AuthenticationError as exc:
        raise VisionAuthError("Claude rejected the API key.",
                              "Set ANTHROPIC_API_KEY, or click 'Try demo desk'.") from exc
    except anthropic.PermissionDeniedError as exc:
        raise VisionAuthError("This API key cannot use the model.", str(exc)[:200]) from exc
    except anthropic.RateLimitError as exc:
        raise VisionRateLimitError("Claude is rate-limiting requests.",
                                   "Wait a few seconds and try again.") from exc
    except anthropic.BadRequestError as exc:
        raise VisionError(f"Claude could not process {what}.", exc.message[:200],
                          status_code=400) from exc
    except anthropic.APIStatusError as exc:
        raise VisionError(f"Claude API error ({exc.status_code}).", "Try again in a moment.") from exc
    except anthropic.APIConnectionError as exc:
        raise VisionError("Could not reach the Claude API.",
                          "Check your internet connection, or use demo mode.") from exc
    except TypeError as exc:
        # Raised before any request when no credentials are configured.
        raise VisionAuthError("No Claude credentials configured.",
                              "Set ANTHROPIC_API_KEY, or click 'Try demo desk'.") from exc

    if response.stop_reason == "refusal":
        raise VisionError(f"Claude declined {what}.", "Try rephrasing.", status_code=422)
    if response.stop_reason == "max_tokens":
        raise VisionError("Claude's answer was cut off.", "Try a simpler request.")
    if response.parsed_output is None:
        raise VisionError("Claude returned an unexpected format.", "Try again.")
    log.info("claude ok (%s), request %s", what, getattr(response, "_request_id", "?"))
    return response.parsed_output


def analyze_desk(image_b64: str, media_type: str, ref_hint: str = "") -> DeskAnalysis:
    content = [
        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
        {"type": "text", "text": "Analyse this desk photo and return the structured inventory." + ref_hint},
    ]
    parsed = claude_parse(SYSTEM_PROMPT, content, DeskAnalysis, what="this image")
    return normalize_analysis(parsed)
