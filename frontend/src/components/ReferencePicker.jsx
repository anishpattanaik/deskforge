import { useEffect, useState } from "react";
import { api } from "../api.js";

// Lets the user say which object of known size is in the photo for scale.
// The choice is remembered between visits.

const STORAGE_KEY = "deskforge.reference";
const FALLBACK_PRESETS = [{ key: "bank_card", name: "bank / credit card", length_mm: 85.6, width_mm: 54 }];

export function loadReference() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.key) return saved;
  } catch {
    /* ignore corrupt storage */
  }
  return { key: "bank_card", name: "bank / credit card", length_mm: 85.6, width_mm: 54 };
}

export function referenceLabel(ref) {
  if (!ref || ref.key === "auto") return "a reference object";
  return ref.key === "custom" ? ref.name || "your reference" : ref.name;
}

export function isReferenceValid(ref) {
  if (ref.key !== "custom") return true;
  const ok = (v) => Number.isFinite(v) && v >= 5 && v <= 400;
  return Boolean(ref.name?.trim()) && ok(ref.length_mm) && ok(ref.width_mm);
}

export default function ReferencePicker({ value, onChange }) {
  const [presets, setPresets] = useState(FALLBACK_PRESETS);

  useEffect(() => {
    api.references().then((r) => setPresets(r.presets)).catch(() => {});
  }, []);

  const update = (next) => {
    onChange(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };

  const pick = (key) => {
    if (key === "custom") {
      update({ key, name: value.key === "custom" ? value.name : "", length_mm: value.length_mm, width_mm: value.width_mm });
    } else if (key === "auto") {
      update({ key, name: "" });
    } else {
      const p = presets.find((x) => x.key === key);
      update({ ...p });
    }
  };

  const custom = value.key === "custom";
  const invalid = custom && !isReferenceValid(value);

  return (
    <div className="ref-picker card">
      <div className="ref-row">
        <span className="ref-label">📏 Scale reference in the photo</span>
        <select value={value.key} onChange={(e) => pick(e.target.value)}>
          {presets.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name} ({p.length_mm} × {p.width_mm} mm)
            </option>
          ))}
          <option value="custom">Something else… (enter its size)</option>
          <option value="auto">None - let the AI guess sizes</option>
        </select>
      </div>
      {custom && (
        <div className="ref-custom">
          <input
            placeholder="What is it? e.g. TV remote"
            maxLength={40}
            value={value.name || ""}
            onChange={(e) => update({ ...value, name: e.target.value })}
          />
          <label>
            L
            <input
              type="number"
              min={5}
              max={400}
              step={0.5}
              placeholder="mm"
              value={value.length_mm ?? ""}
              onChange={(e) => update({ ...value, length_mm: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </label>
          <label>
            W
            <input
              type="number"
              min={5}
              max={400}
              step={0.5}
              placeholder="mm"
              value={value.width_mm ?? ""}
              onChange={(e) => update({ ...value, width_mm: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </label>
          <span className="muted small">mm</span>
        </div>
      )}
      {invalid && (
        <div className="inline-error small">Name it and enter length and width (5–400 mm) - measure it with a ruler.</div>
      )}
      {value.key === "auto" && (
        <div className="muted small">Without a reference, sizes are guesses - you'll want to check the sliders.</div>
      )}
    </div>
  );
}
