import { useRef } from "react";

// "The drawing set": a horizontally scrolling strip of engineering sheets.
// Drag with the mouse, scroll with the wheel/trackpad, or use the arrow buttons.

const SHEETS = [
  {
    n: "01", title: "Layout packer", spec: "3 ORIENTATIONS × 6 ROW WIDTHS",
    body: "Shelf-packs pockets, scores every candidate for bed overflow and area, and keeps the smallest layout that fits.",
    svg: (<g><rect x="10" y="10" width="44" height="30" /><rect x="58" y="10" width="32" height="30" /><rect x="10" y="44" width="28" height="26" /><rect x="42" y="44" width="48" height="26" /></g>),
  },
  {
    n: "02", title: "Finger-scoop pockets", spec: "FILLET ≤ R3 · 0.6 H RATIO",
    body: "Each pocket is a filleted cutter, so you can scoop items out instead of prying at sharp corners.",
    svg: (<g><path d="M10 20 V60 H90 V20" /><path d="M22 20 V50 Q22 56 28 56 H72 Q78 56 78 50 V20" className="accent" /></g>),
  },
  {
    n: "03", title: "Snap-fit cable clips", spec: "MOUTH = 0.78 × Ø",
    body: "A round channel 0.6 mm bigger than the cable, with a narrower mouth. The cable clicks in and won't fall out.",
    svg: (<g><rect x="10" y="20" width="80" height="44" /><circle cx="50" cy="44" r="12" className="accent" /><path d="M45 20 V33 M55 20 V33" /></g>),
  },
  {
    n: "04", title: "Engraved labels", spec: "0.6 MM DEEP · ONE BOOLEAN",
    body: "Every label is cut in a single boolean operation, which made full builds about 2× faster than cutting them one by one.",
    svg: (<g><rect x="10" y="20" width="80" height="44" /><text x="50" y="48" textAnchor="middle" className="accent-text">PENS</text></g>),
  },
  {
    n: "05", title: "Honest AI edits", spec: "PARAMS ONLY · DIFFED",
    body: "Prompts edit parameters, never raw geometry. The change list is computed from the real before and after, so the AI can't claim changes it didn't make.",
    svg: (<g><path d="M14 30 H44 M14 42 H38 M14 54 H46" /><path d="M56 42 H86 M78 34 L86 42 L78 50" className="accent" /></g>),
  },
  {
    n: "06", title: "Bounded local AI", spec: "≤ 12 ITEMS · GRAMMAR-CAPPED",
    body: "The local model's JSON is constrained while it's generated, so a cluttered photo always finishes. A 24-object test finished in 95 s.",
    svg: (<g><rect x="10" y="16" width="80" height="52" /><path d="M20 30 H70 M20 42 H62 M20 54 H50" /><path d="M76 24 V60" className="accent" /></g>),
  },
];

export default function SpecSheets() {
  const track = useRef(null);
  const drag = useRef(null);

  const onDown = (e) => {
    drag.current = { x: e.clientX, left: track.current.scrollLeft, moved: false };
    track.current.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    if (Math.abs(dx) > 3) drag.current.moved = true;
    track.current.scrollLeft = drag.current.left - dx;
  };
  const onUp = () => (drag.current = null);
  const nudge = (dir) => track.current.scrollBy({ left: dir * 340, behavior: "smooth" });

  return (
    <section className="specs section" id="specs">
      <div className="sec-head row">
        <div>
          <div className="section-label mono">[ 04 / THE DRAWING SET ] <span className="dots">· · ··· ·</span></div>
          <h2>Under the hood.</h2>
        </div>
        <div className="sheet-nav">
          <button className="btn ghost" onClick={() => nudge(-1)} aria-label="Previous sheets">←</button>
          <button className="btn ghost" onClick={() => nudge(1)} aria-label="Next sheets">→</button>
        </div>
      </div>
      <div
        className="sheet-track"
        ref={track}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {SHEETS.map((s) => (
          <article className="sheet" key={s.n}>
            <div className="sheet-head mono">
              <span>SHEET {s.n}</span>
              <span>{s.spec}</span>
            </div>
            <svg className="sheet-fig" viewBox="0 0 100 80" aria-hidden>
              <g className="grid">
                {Array.from({ length: 9 }, (_, i) => (
                  <line key={`v${i}`} x1={i * 12.5} y1="0" x2={i * 12.5} y2="80" />
                ))}
                {Array.from({ length: 7 }, (_, i) => (
                  <line key={`h${i}`} x1="0" y1={i * 13.3} x2="100" y2={i * 13.3} />
                ))}
              </g>
              {s.svg}
            </svg>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </article>
        ))}
      </div>
      <div className="sheet-hint mono">DRAG · SCROLL · {SHEETS.length} SHEETS</div>
    </section>
  );
}
