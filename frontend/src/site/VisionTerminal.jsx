import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { prefersReducedMotion, useInView } from "./hooks.js";

// Shows what the vision model actually returns: a desk "photo" with detection boxes
// on the left, and the structured JSON typing itself out on the right.

const BOXES = [
  { x: 8, y: 18, w: 26, h: 20, label: "wireless mouse · 116×63 mm" },
  { x: 40, y: 10, w: 34, h: 16, label: "smartphone · 147×72 mm" },
  { x: 14, y: 52, w: 46, h: 7, label: "pens ×3 · 142×11 mm" },
  { x: 66, y: 44, w: 20, h: 18, label: "sticky notes · 76×76 mm" },
  { x: 78, y: 74, w: 16, h: 11, label: "REFERENCE · bank card", ref: true },
  { x: 6, y: 80, w: 62, h: 3, label: "usb_c · Ø 4.0 mm", cable: true },
];

export default function VisionTerminal() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.35 });
  const [json, setJson] = useState("");
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    api
      .demo()
      .then((d) => {
        const a = d.analysis;
        const slim = {
          reference_object: a.reference_object,
          items: a.items.slice(0, 3).map(({ name, category, quantity, length_mm, width_mm, height_mm, include_in_organizer }) => ({
            name, category, quantity, length_mm, width_mm, height_mm, include_in_organizer,
          })),
          cables: a.cables.slice(0, 2).map(({ cable_type, count, diameter_mm }) => ({ cable_type, count, diameter_mm })),
          clutter_score: a.clutter_score,
        };
        setJson(JSON.stringify(slim, null, 2));
      })
      .catch(() => setJson('{\n  "items": [ { "name": "Wireless mouse", "length_mm": 116 } ]\n}'));
  }, []);

  // Type the JSON out once it scrolls into view.
  useEffect(() => {
    if (!inView || !json) return;
    if (prefersReducedMotion()) {
      setTyped(json.length);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(json.length, i + 9);
      setTyped(i);
      if (i >= json.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [inView, json]);

  const done = json && typed >= json.length;
  const visibleBoxes = useMemo(() => {
    if (!json) return 0;
    return Math.ceil((typed / json.length) * BOXES.length);
  }, [typed, json]);

  return (
    <section className="vision section" id="vision" ref={ref}>
      <div className="sec-head">
        <div className="section-label mono">[ 02 / AI VISION ] <span className="dots">· · ·· ··· ····</span></div>
        <h2>It sees millimetres,<br />not just objects.</h2>
        <p className="section-lede">
          The model is forced to answer in a fixed JSON schema, so there's no prose and no guessing
          what it meant. Every number goes straight into the CAD engine.
        </p>
      </div>

      <div className="vision-grid">
        <div className="vision-photo" aria-label="Detected objects on a desk">
          <div className="desk-surface" />
          {BOXES.map((b, i) => (
            <div
              key={b.label}
              className={`det-box ${b.ref ? "ref" : ""} ${b.cable ? "cable" : ""} ${i < visibleBoxes ? "on" : ""}`}
              style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
            >
              <span className="mono">{b.label}</span>
            </div>
          ))}
          <div className={`scan-sweep ${inView && !done ? "run" : ""}`} />
        </div>

        <div className="terminal">
          <div className="terminal-bar mono">
            <span className="tl r" /><span className="tl y" /><span className="tl g" />
            <span>POST /api/analyze → 200</span>
            <span className={`schema-ok ${done ? "on" : ""}`}>✓ schema-valid</span>
          </div>
          <pre className="mono">
            <code>{json.slice(0, typed)}</code>
            <span className="caret" />
          </pre>
        </div>
      </div>
    </section>
  );
}
