"""Scale reference objects.

A single photo has no absolute scale, so the user puts an object of known size on
the desk. They can pick a preset or enter any object's size; the vision model is
told exactly what to look for and how big it is.
"""

from __future__ import annotations

from dataclasses import dataclass

from .schemas import DeskAnalysis


@dataclass(frozen=True)
class Reference:
    key: str
    name: str            # what the model should look for
    length_mm: float
    width_mm: float
    ref_type: str        # value for DeskAnalysis.reference_object.type
    match_words: tuple[str, ...] = ()


PRESETS: dict[str, Reference] = {r.key: r for r in [
    Reference("bank_card", "bank / credit card", 85.6, 54.0, "credit_card",
              ("card", "visa", "mastercard", "credit", "debit")),
    Reference("business_card", "business card", 89.0, 51.0, "business_card",
              ("business card", "card")),
    Reference("sticky_note", "square sticky-note pad (Post-it)", 76.0, 76.0, "sticky_note",
              ("sticky", "post-it", "note")),
    Reference("a4_paper", "A4 sheet of paper", 297.0, 210.0, "a4_paper", ("a4", "paper", "sheet")),
    Reference("us_letter", "US Letter sheet of paper", 279.4, 215.9, "us_letter_paper",
              ("letter", "paper", "sheet")),
    Reference("us_quarter", "US quarter coin", 24.3, 24.3, "coin", ("quarter", "coin")),
    Reference("euro_coin", "1 euro coin", 23.3, 23.3, "coin", ("euro", "coin")),
    Reference("aa_battery", "AA battery", 50.5, 14.5, "battery", ("battery", "aa")),
    Reference("ruler_30cm", "30 cm ruler", 300.0, 30.0, "ruler", ("ruler",)),
]}

DEFAULT_KEY = "bank_card"


def resolve_reference(key: str | None, name: str | None = None, length_mm: float | None = None,
                      width_mm: float | None = None) -> Reference | None:
    """None = 'auto' (let the model look for any common reference)."""
    if not key or key == "auto":
        return None
    if key == "custom":
        if not name or not length_mm or not width_mm:
            return None
        length, width = max(length_mm, width_mm), min(length_mm, width_mm)
        words = tuple(w for w in name.lower().split() if len(w) > 2)
        return Reference("custom", name.strip()[:40], round(length, 1), round(width, 1), "other", words)
    return PRESETS.get(key)


def prompt_hint(ref: Reference | None) -> str:
    if ref is None:
        return ""
    return (f"\n\nSCALE REFERENCE: the user placed a {ref.name} measuring "
            f"{ref.length_mm:g} x {ref.width_mm:g} mm on the desk. Find it and derive every other "
            f"dimension from its size in the photo. Report it in reference_object "
            f"(detected=true, type=\"{ref.ref_type}\"). Do NOT list it in items.")


def apply_reference(a: DeskAnalysis, ref: Reference | None) -> DeskAnalysis:
    """Remove the reference object if the model listed it as clutter anyway.

    An item only counts as the reference if its name matches AND its size is
    within 35% of the reference - so a real sticky-note pad that should get a
    pocket isn't thrown away just because the reference is also a sticky note.
    """
    if ref is None:
        ref = PRESETS[DEFAULT_KEY]  # auto mode: a stray bank card is the usual suspect
    kept = []
    for it in a.items:
        name = it.name.lower()
        name_match = any(w in name for w in ref.match_words) and "sd card" not in name
        size_match = (abs(it.length_mm - ref.length_mm) <= 0.35 * ref.length_mm
                      and abs(it.width_mm - ref.width_mm) <= 0.35 * ref.width_mm)
        if name_match and size_match:
            a.reference_object.detected = True
            a.reference_object.type = ref.ref_type
            a.reference_object.notes = f"{ref.name} used for scale."
            continue
        kept.append(it)
    a.items = kept
    return a
