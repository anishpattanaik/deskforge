import { scrollToId } from "./hooks.js";

const INDEX = [
  ["story", "How it works"],
  ["vision", "AI vision"],
  ["features", "Features"],
  ["specs", "The drawing set"],
  ["faq", "FAQ"],
  ["generator", "Generator"],
];

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-cta">
        <h2>Your desk, organised in one photo.</h2>
        <button className="btn primary big" onClick={() => scrollToId("generator")}>Start forging ↑</button>
      </div>
      <div className="footer-grid">
        <div>
          <div className="mono footer-label">[ DESKFORGE ]</div>
          <p className="muted">Photo → AI measurements → parametric CAD → printable STL.</p>
        </div>
        <nav>
          <div className="mono footer-label">[ INDEX ]</div>
          {INDEX.map(([id, label], i) => (
            <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); scrollToId(id); }}>
              <span className="mono">0{i + 1}</span> {label}
            </a>
          ))}
        </nav>
        <div>
          <div className="mono footer-label">[ STACK ]</div>
          <p className="muted mono small">REACT · THREE.JS · FASTAPI · CADQUERY · CLAUDE · QWEN2.5-VL · OLLAMA</p>
        </div>
      </div>
      <div className="footer-word" aria-hidden>DESKFORGE</div>
    </footer>
  );
}
