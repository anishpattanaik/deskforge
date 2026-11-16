import { useState } from "react";
import Slider from "./Slider.jsx";
import { CABLE_NAMES, CATEGORY_ICONS, REFERENCE_NAMES } from "../labels.js";

function ItemCard({ item, onChange, onRemove, onHover }) {
  const [open, setOpen] = useState(item.include);
  const set = (patch) => onChange({ ...item, ...patch });
  return (
    <div
      className={`card item ${item.include ? "on" : "off"}`}
      onMouseEnter={() => onHover(item.include ? item.id : null)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="item-head">
        <input
          type="checkbox"
          checked={item.include}
          onChange={(e) => {
            set({ include: e.target.checked });
            if (e.target.checked) setOpen(true);
          }}
          title="Give this item a pocket"
        />
        <span className="item-icon">{CATEGORY_ICONS[item.category] || "📦"}</span>
        <input
          className="item-name"
          value={item.label}
          maxLength={40}
          onChange={(e) => set({ label: e.target.value })}
        />
        {item.confidence != null && (
          <span className={`pill ${item.confidence >= 0.75 ? "good" : item.confidence >= 0.5 ? "mid" : "low"}`}>
            {Math.round(item.confidence * 100)}%
          </span>
        )}
        <button className="icon-btn" onClick={() => setOpen(!open)} title="Edit dimensions">
          {open ? "▾" : "▸"}
        </button>
        {item.custom && (
          <button className="icon-btn" onClick={onRemove} title="Remove">
            ✕
          </button>
        )}
      </div>
      {!open && (
        <div className="item-dims muted small">
          {Math.round(item.length_mm)} × {Math.round(item.width_mm)} × {Math.round(item.height_mm)} mm
          {item.quantity > 1 && ` · ×${item.quantity}`}
          {item.reason && ` · ${item.reason}`}
        </div>
      )}
      {open && (
        <div className="item-body">
          <Slider label="Length" value={item.length_mm} min={5} max={300} onChange={(v) => set({ length_mm: v })} />
          <Slider label="Width" value={item.width_mm} min={3} max={200} onChange={(v) => set({ width_mm: v })} />
          <Slider label="Height" value={item.height_mm} min={1} max={150} onChange={(v) => set({ height_mm: v })} />
          <Slider label="Qty" value={item.quantity} min={1} max={12} unit="" onChange={(v) => set({ quantity: v })} />
        </div>
      )}
    </div>
  );
}

function CableRow({ cable, onChange }) {
  const set = (patch) => onChange({ ...cable, ...patch });
  return (
    <div className={`card cable ${cable.include ? "on" : "off"}`}>
      <div className="item-head">
        <input type="checkbox" checked={cable.include} onChange={(e) => set({ include: e.target.checked })} />
        <span className="item-icon">🔌</span>
        <span className="cable-name">
          {cable.label} <span className="muted small">×{cable.count}</span>
        </span>
      </div>
      {cable.include && (
        <div className="item-body">
          <Slider label="Ø" value={cable.diameter_mm} min={1.5} max={15} step={0.1} onChange={(v) => set({ diameter_mm: v })} />
          <Slider label="Clips" value={cable.count} min={1} max={8} unit="" onChange={(v) => set({ count: v })} />
        </div>
      )}
    </div>
  );
}

export default function AnalysisPanel({ meta, items, cables, setItems, setCables, onHover }) {
  const { analysis, source, model } = meta;
  const ref = analysis.reference_object;
  const included = items.filter((i) => i.include).length;

  const updateItem = (next) => setItems((list) => list.map((i) => (i.id === next.id ? next : i)));
  const updateCable = (next) => setCables((list) => list.map((c) => (c.id === next.id ? next : c)));
  const addItem = () =>
    setItems((list) => [
      ...list,
      {
        id: `custom-${Date.now()}`,
        label: "Custom item",
        category: "misc",
        length_mm: 60,
        width_mm: 40,
        height_mm: 20,
        quantity: 1,
        include: true,
        custom: true,
      },
    ]);

  return (
    <div className="analysis">
      <div className="card summary">
        <div className="summary-top">
          <div>
            <div className="eyebrow">
              {source === "demo"
                ? "Demo analysis"
                : source === "local"
                  ? `Analysed locally by ${model}`
                  : `Analysed by ${model || "Claude"}`}
            </div>
            <p>{analysis.summary}</p>
          </div>
          <div className="score" title="Clutter score">
            <svg viewBox="0 0 36 36">
              <path className="score-bg" d="M18 2 a16 16 0 1 1 0 32 a16 16 0 1 1 0 -32" />
              <path
                className="score-fg"
                strokeDasharray={`${analysis.clutter_score}, 100`}
                d="M18 2 a16 16 0 1 1 0 32 a16 16 0 1 1 0 -32"
              />
            </svg>
            <span>{analysis.clutter_score}</span>
            <small>clutter</small>
          </div>
        </div>
        <div className={`ref-chip ${ref.detected ? "ok" : "warn"}`}>
          {ref.detected
            ? `📏 Scaled from a ${REFERENCE_NAMES[ref.type] || ref.type}`
            : "📏 No scale reference - sizes are estimates, check the sliders"}
        </div>
        {analysis.clutter_categories?.length > 0 && (
          <div className="clutter-cats">
            {analysis.clutter_categories.map((c) => (
              <div key={c.category} className="clutter-cat" title={c.description}>
                <span>{c.category}</span>
                <span className="sev">
                  {"●".repeat(c.severity)}
                  <span className="sev-off">{"●".repeat(5 - c.severity)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section-head">
        <h3>Items</h3>
        <span className="muted small">{included} with pockets</span>
        <button className="btn tiny ghost" onClick={addItem}>+ Add</button>
      </div>
      <div className="list">
        {items.map((it) => (
          <ItemCard
            key={it.id}
            item={it}
            onChange={updateItem}
            onHover={onHover}
            onRemove={() => setItems((list) => list.filter((i) => i.id !== it.id))}
          />
        ))}
      </div>

      {cables.length > 0 && (
        <>
          <div className="section-head">
            <h3>Cables</h3>
            <span className="muted small">snap-in clips on the back rail</span>
          </div>
          <div className="list">
            {cables.map((c) => (
              <CableRow key={c.id} cable={c} onChange={updateCable} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function toEditableState(analysis) {
  const items = analysis.items.map((it, n) => ({
    id: `item-${n}`,
    label: it.name.slice(0, 40),
    category: it.category,
    length_mm: it.length_mm,
    width_mm: it.width_mm,
    height_mm: it.height_mm,
    quantity: it.quantity,
    confidence: it.confidence,
    reason: it.reason,
    include: it.include_in_organizer,
  }));
  items.sort((a, b) => Number(b.include) - Number(a.include));
  const cables = analysis.cables.map((c, n) => ({
    id: `cable-${n}`,
    label: CABLE_NAMES[c.cable_type] || c.cable_type,
    diameter_mm: c.diameter_mm,
    count: c.count,
    include: true,
  }));
  return { items, cables };
}
