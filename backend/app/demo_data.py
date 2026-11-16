"""Canned analysis used for demo mode (no API key, flaky Wi-Fi, or video takes)."""

from .schemas import DeskAnalysis

DEMO_ANALYSIS = DeskAnalysis.model_validate({
    "summary": (
        "A busy work desk: a laptop and mechanical keyboard dominate the surface, while a mouse, "
        "phone, earbuds, pens, sticky notes, USB sticks and keys are scattered around them. "
        "Several charging and video cables run loose across the desk."
    ),
    "clutter_score": 72,
    "reference_object": {
        "detected": True,
        "type": "credit_card",
        "notes": "A card (85.6 x 54 mm) near the mouse was used to set the scale.",
    },
    "items": [
        {"name": "Wireless mouse", "category": "peripheral", "quantity": 1,
         "length_mm": 116, "width_mm": 63, "height_mm": 39, "confidence": 0.9,
         "include_in_organizer": True, "reason": "Used daily; a dock pocket keeps it parked."},
        {"name": "Smartphone", "category": "mobile_device", "quantity": 1,
         "length_mm": 147, "width_mm": 72, "height_mm": 9, "confidence": 0.88,
         "include_in_organizer": True, "reason": "Lying flat next to the keyboard."},
        {"name": "Earbuds case", "category": "audio", "quantity": 1,
         "length_mm": 51, "width_mm": 45, "height_mm": 24, "confidence": 0.8,
         "include_in_organizer": True, "reason": "Small item that tends to get lost."},
        {"name": "Pens", "category": "writing", "quantity": 3,
         "length_mm": 142, "width_mm": 11, "height_mm": 11, "confidence": 0.85,
         "include_in_organizer": True, "reason": "Three pens rolling loose."},
        {"name": "Sticky notes", "category": "stationery", "quantity": 1,
         "length_mm": 76, "width_mm": 76, "height_mm": 16, "confidence": 0.9,
         "include_in_organizer": True, "reason": "Square pad, fits a dedicated well."},
        {"name": "USB flash drive", "category": "storage_media", "quantity": 2,
         "length_mm": 42, "width_mm": 14, "height_mm": 8, "confidence": 0.7,
         "include_in_organizer": True, "reason": "Two small drives easy to misplace."},
        {"name": "Keys", "category": "personal", "quantity": 1,
         "length_mm": 82, "width_mm": 40, "height_mm": 16, "confidence": 0.75,
         "include_in_organizer": True, "reason": "Keyring dropped on the desk."},
        {"name": "Laptop", "category": "peripheral", "quantity": 1,
         "length_mm": 304, "width_mm": 212, "height_mm": 16, "confidence": 0.95,
         "include_in_organizer": False, "reason": "Too large for a desktop tray."},
        {"name": "Mechanical keyboard", "category": "peripheral", "quantity": 1,
         "length_mm": 360, "width_mm": 130, "height_mm": 35, "confidence": 0.9,
         "include_in_organizer": False, "reason": "Primary input device; stays out."},
        {"name": "Coffee mug", "category": "personal", "quantity": 1,
         "length_mm": 120, "width_mm": 85, "height_mm": 95, "confidence": 0.85,
         "include_in_organizer": False, "reason": "Holds liquid; not tray material."},
    ],
    "cables": [
        {"cable_type": "usb_c", "count": 2, "diameter_mm": 4.0,
         "description": "Two USB-C charging cables (laptop and phone)."},
        {"cable_type": "hdmi", "count": 1, "diameter_mm": 7.5,
         "description": "HDMI cable to the external monitor."},
        {"cable_type": "lightning", "count": 1, "diameter_mm": 3.5,
         "description": "Lightning cable for the earbuds case."},
        {"cable_type": "ac_power", "count": 1, "diameter_mm": 6.5,
         "description": "Laptop power brick lead."},
    ],
    "clutter_categories": [
        {"category": "Loose cables", "severity": 4,
         "description": "Five cables crossing the work area with nothing holding them."},
        {"category": "Small loose items", "severity": 4,
         "description": "Keys, USB drives and earbuds scattered around the keyboard."},
        {"category": "Writing supplies", "severity": 2,
         "description": "Pens and sticky notes with no fixed place."},
    ],
})
