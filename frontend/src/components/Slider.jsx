export default function Slider({ label, value, min, max, step = 1, unit = "mm", onChange, disabled }) {
  const fmt = step < 1 ? Number(value).toFixed(1) : Math.round(value);
  return (
    <label className={`slider ${disabled ? "disabled" : ""}`}>
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider-value">
        {fmt}
        {unit && <small>{unit}</small>}
      </span>
    </label>
  );
}
