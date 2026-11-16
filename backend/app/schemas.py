"""Pydantic models shared by the vision, layout and CAD stages.

Two families live here:
  * Vision output (`DeskAnalysis` & friends) - the exact JSON schema Claude is
    constrained to via structured outputs. Kept free of numeric constraints so
    the schema stays compatible with structured outputs; values are clamped
    in `vision.normalize_analysis` instead.
  * Generation input (`GenerateRequest` & friends) - what the frontend sends
    after the user has reviewed / edited the detections with sliders. These
    carry hard validation bounds so bad input fails fast with a 422.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# --------------------------------------------------------------------------
# Vision output (structured-output schema)
# --------------------------------------------------------------------------

ItemCategory = Literal[
    "peripheral",
    "writing",
    "mobile_device",
    "audio",
    "storage_media",
    "stationery",
    "personal",
    "tool",
    "misc",
]

CableType = Literal[
    "usb_c",
    "usb_a",
    "lightning",
    "micro_usb",
    "hdmi",
    "displayport",
    "power_barrel",
    "ac_power",
    "audio_3_5mm",
    "ethernet",
    "other",
]

ReferenceType = Literal[
    "credit_card",
    "business_card",
    "sticky_note",
    "a4_paper",
    "us_letter_paper",
    "coin",
    "battery",
    "ruler",
    "other",
    "none",
]


class ReferenceObject(BaseModel):
    detected: bool
    type: ReferenceType
    notes: str


class DetectedItem(BaseModel):
    name: str
    category: ItemCategory
    quantity: int
    length_mm: float
    width_mm: float
    height_mm: float
    confidence: float
    include_in_organizer: bool
    reason: str


class DetectedCable(BaseModel):
    cable_type: CableType
    count: int
    diameter_mm: float
    description: str


class ClutterCategory(BaseModel):
    category: str
    severity: int
    description: str


class DeskAnalysis(BaseModel):
    summary: str
    clutter_score: int
    reference_object: ReferenceObject
    items: list[DetectedItem]
    cables: list[DetectedCable]
    clutter_categories: list[ClutterCategory]


class AnalyzeResponse(BaseModel):
    source: Literal["claude", "local", "demo"]
    model: str | None = None
    analysis: DeskAnalysis
    warnings: list[str] = []


# --------------------------------------------------------------------------
# Generation input (user-reviewed parameters)
# --------------------------------------------------------------------------


class OrganizerItem(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=40)
    length_mm: float = Field(ge=5, le=300)
    width_mm: float = Field(ge=3, le=300)
    height_mm: float = Field(ge=1, le=200)
    quantity: int = Field(default=1, ge=1, le=12)


class OrganizerCable(BaseModel):
    label: str = Field(min_length=1, max_length=40)
    diameter_mm: float = Field(ge=1.5, le=15)
    count: int = Field(default=1, ge=1, le=12)


class OrganizerSettings(BaseModel):
    wall_mm: float = Field(default=2.0, ge=1.2, le=5)
    floor_mm: float = Field(default=2.0, ge=1.2, le=5)
    clearance_mm: float = Field(default=3.0, ge=0, le=15)
    wall_height_ratio: float = Field(default=0.6, ge=0.2, le=1.2)
    max_width_mm: float = Field(default=250, ge=80, le=400)
    corner_radius_mm: float = Field(default=3.0, ge=0, le=10)
    engrave_labels: bool = True
    cable_rail: bool = True
    front_text: str = Field(default="", max_length=24)


class GenerateRequest(BaseModel):
    items: list[OrganizerItem] = Field(min_length=1, max_length=30)
    cables: list[OrganizerCable] = Field(default_factory=list, max_length=12)
    settings: OrganizerSettings = Field(default_factory=OrganizerSettings)


class PocketOut(BaseModel):
    id: str
    label: str
    x: float
    y: float
    w: float
    d: float
    wall_h: float


class SlotOut(BaseModel):
    label: str
    x: float
    diameter_mm: float


class GenerateResponse(BaseModel):
    model_id: str
    stl_url: str
    size_mm: tuple[float, float, float]
    volume_cm3: float
    est_filament_g: float
    triangle_count: int
    generation_ms: int
    pockets: list[PocketOut]
    slots: list[SlotOut]
    rail_y: float | None
    warnings: list[str]
