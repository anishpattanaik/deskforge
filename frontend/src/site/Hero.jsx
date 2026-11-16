import { useRef } from "react";
import { scrollToId, useScramble } from "./hooks.js";

function Word({ text, delay = 0 }) {
  return (
    <span className="hero-word" aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} className="hero-letter" style={{ animationDelay: `${delay + i * 55}ms` }} aria-hidden>
          {ch}
        </span>
      ))}
    </span>
  );
}

export default function Hero() {
  const ref = useRef(null);
  const meta = useScramble("PHOTO → PARAMETRIC CAD → PRINTABLE STL", true, 1100);

  // Blueprint spotlight follows the cursor (CSS variables, no re-render).
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--mx", `${e.clientX - r.left}px`);
    ref.current.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <section className="hero" id="top" ref={ref} onMouseMove={onMove}>
      <div className="hero-grid" aria-hidden />
      <div className="hero-spot" aria-hidden />
      <div className="hero-corners" aria-hidden>
        <span>[ SHEET 00 / COVER ]</span>
        <span>SCALE 1:1 · UNITS MM</span>
      </div>

      <div className="hero-inner">
        <span className="hero-kicker">AI · PARAMETRIC CAD · 3D PRINTING</span>
        <h1 className="hero-title">
          <Word text="DESK" />
          <Word text="FORGE" delay={260} />
        </h1>
        <p className="hero-meta mono">{meta}</p>
        <p className="hero-lede">
          Snap one photo of your messy desk. AI measures every item and cable, then a CAD engine
          forges a custom organizer that fits <em>your</em> stuff, ready to 3D print.
        </p>
        <div className="hero-cta">
          <button className="btn primary big" onClick={() => scrollToId("generator")}>
            Start forging ↓
          </button>
          <button className="btn ghost big" onClick={() => scrollToId("story")}>
            See how it works
          </button>
        </div>
        <ul className="hero-facts mono">
          <li><b>~1 s</b> live rebuilds</li>
          <li><b>$0</b> free local AI</li>
          <li><b>100%</b> offline capable</li>
        </ul>
      </div>

      <button className="scroll-cue mono" onClick={() => scrollToId("story")} aria-label="Scroll down">
        SCROLL
        <span className="scroll-line" />
      </button>
    </section>
  );
}
