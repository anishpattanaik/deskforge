import Slider from "./Slider.jsx";

export const DEFAULT_SETTINGS = {
  wall_mm: 2.0,
  floor_mm: 2.0,
  clearance_mm: 3.0,
  wall_height_ratio: 0.6,
  max_width_mm: 250,
  corner_radius_mm: 3.0,
  engrave_labels: true,
  cable_rail: true,
  front_text: "",
};

const BEDS = [
  { label: "Ender 3 · 220", value: 220 },
  { label: "Prusa MK4 · 250", value: 250 },
  { label: "Bambu · 256", value: 256 },
  { label: "Large · 300", value: 300 },
];

export default function SettingsPanel({ settings, setSettings }) {
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  return (
    <div className="settings card">
      <div className="settings-grid">
        <Slider label="Wall" value={settings.wall_mm} min={1.2} max={5} step={0.1} onChange={(v) => set({ wall_mm: v })} />
        <Slider label="Floor" value={settings.floor_mm} min={1.2} max={5} step={0.1} onChange={(v) => set({ floor_mm: v })} />
        <Slider label="Clearance" value={settings.clearance_mm} min={0} max={15} step={0.5} onChange={(v) => set({ clearance_mm: v })} />
        <Slider label="Wall height" value={settings.wall_height_ratio * 100} min={20} max={120} step={5} unit="%" onChange={(v) => set({ wall_height_ratio: v / 100 })} />
        <Slider label="Corners" value={settings.corner_radius_mm} min={0} max={10} step={0.5} onChange={(v) => set({ corner_radius_mm: v })} />
        <label className="slider">
          <span className="slider-label">Bed</span>
          <select value={settings.max_width_mm} onChange={(e) => set({ max_width_mm: Number(e.target.value) })}>
            {BEDS.map((b) => (
              <option key={b.value} value={b.value}>{b.label} mm</option>
            ))}
          </select>
        </label>
      </div>
      <div className="toggles">
        <label><input type="checkbox" checked={settings.engrave_labels} onChange={(e) => set({ engrave_labels: e.target.checked })} /> Engrave labels</label>
        <label><input type="checkbox" checked={settings.cable_rail} onChange={(e) => set({ cable_rail: e.target.checked })} /> Cable rail</label>
        <label className="front-text">
          Front text
          <input
            value={settings.front_text}
            maxLength={24}
            placeholder="none"
            onChange={(e) => set({ front_text: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
