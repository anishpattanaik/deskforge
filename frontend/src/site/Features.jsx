import { useRef } from "react";
import { useCountUp, useInView } from "./hooks.js";

const FEATURES = [
  { n: "F1", icon: "📏", title: "Any scale reference", body: "A bank card, sticky note, AA battery, or a TV remote you measured yourself. Tell it what's in the frame and every pocket comes out true to size." },
  { n: "F2", icon: "🎚️", title: "Live parametric sliders", body: "Every dimension is a slider. A rough draft rebuilds in about a second, then the full model with engraved labels follows." },
  { n: "F3", icon: "✦", title: "Ask for changes", body: "“Fit 6 pens, engrave APEX on the front.” The AI edits the parameters, never the geometry, so every result stays printable, and it says honestly what it couldn't do." },
  { n: "F4", icon: "🔌", title: "Snap-fit cable clips", body: "Each cable gets a clip sized to its measured diameter, with a mouth about 78% as wide so it clicks in and stays put." },
  { n: "F5", icon: "🔒", title: "Free & offline", body: "No API key? A local vision model runs on your own GPU through Ollama. Your desk photo never leaves your computer." },
  { n: "F6", icon: "🖨️", title: "Print-ready STL", body: "Shared walls, finger-scoop fillets, labels engraved into the floors. Watertight, support-free, and packed to fit your printer bed." },
];

function FeatureCard({ f }) {
  const ref = useRef(null);
  // Cursor-follow glow + gentle 3D tilt, all via CSS variables.
  const onMove = (e) => {
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--gx", `${x * 100}%`);
    el.style.setProperty("--gy", `${y * 100}%`);
    el.style.setProperty("--rx", `${(0.5 - y) * 7}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 9}deg`);
  };
  const onLeave = () => {
    ref.current.style.setProperty("--rx", "0deg");
    ref.current.style.setProperty("--ry", "0deg");
  };
  return (
    <article className="feature" ref={ref} onMouseMove={onMove} onMouseLeave={onLeave}>
      <div className="feature-top mono">
        <span>[ {f.n} ]</span>
        <span className="feature-icon" aria-hidden>{f.icon}</span>
      </div>
      <h3>{f.title}</h3>
      <p>{f.body}</p>
    </article>
  );
}

function Stat({ value, decimals = 0, prefix = "", suffix, label, active }) {
  const v = useCountUp(value, active, 1400, decimals);
  return (
    <div className="big-stat">
      <span className="big-num">{prefix}{v}<small>{suffix}</small></span>
      <span className="mono">{label}</span>
    </div>
  );
}

export default function Features() {
  const statsRef = useRef(null);
  const inView = useInView(statsRef, { threshold: 0.5 });
  return (
    <section className="features section" id="features">
      <div className="sec-head">
        <div className="section-label mono">[ 03 / FEATURES ] <span className="dots">· ·· · ··· ·</span></div>
        <h2>Built like a tool,<br />not a toy.</h2>
      </div>
      <div className="feature-grid">
        {FEATURES.map((f) => (
          <FeatureCard key={f.n} f={f} />
        ))}
      </div>
      <div className="stats-band" ref={statsRef}>
        <Stat value={1.0} decimals={1} suffix=" s" label="DRAFT REBUILD" active={inView} />
        <Stat value={3} suffix=" s" label="FULL CAD COMPILE" active={inView} />
        <Stat value={59} suffix=" s" label="LOCAL AI · LAPTOP GPU" active={inView} />
        <Stat value={0} prefix="$" label="COST IN OFFLINE MODE" active={inView} />
      </div>
    </section>
  );
}
