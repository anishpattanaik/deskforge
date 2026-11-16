import { useEffect, useState } from "react";
import { api, loadDemoModel } from "./api.js";
import Viewer from "./components/Viewer.jsx";
import { CABLE_NAMES, CATEGORY_ICONS } from "./labels.js";

// GitHub Pages has no server, so instead of the live generator the static site shows
// the real pre-built demo organizer (orbit it, hover items, download the STL) and
// explains how to run the full photo -> CAD generator for free on your own PC.

const REPO = "https://github.com/anishpattanaik/deskforge";

export default function StaticGenerator() {
  const [result, setResult] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const [hoverId, setHoverId] = useState(null);

  useEffect(() => {
    loadDemoModel().then(setResult).catch((e) => setError(e.message));
    api.demo().then((d) => setAnalysis(d.analysis)).catch(() => {});
  }, []);

  // Map demo items to the pocket ids used in the pre-built model (d0, d1, ...).
  // (same numbering as export_static_demo.py: index in the full item list)
  const pocketItems = (analysis?.items || []).map((i, n) => ({ ...i, id: `d${n}` })).filter((i) => i.include_in_organizer);

  return (
    <div className="generator static-gen">
      <header className="gen-bar">
        <div className="gen-title">
          <span className="mono-label">[ G / GENERATOR · LIVE DEMO ]</span>
          <span className="gen-sub">a real organizer forged by DeskForge from the sample desk</span>
        </div>
        <a className="btn ghost tiny" href={REPO} target="_blank" rel="noreferrer">★ View on GitHub</a>
      </header>

      <div className="workspace">
        <aside className="left">
          <div className="card run-local">
            <div className="eyebrow">Make one for your desk</div>
            <h3>The full generator runs on your PC, free</h3>
            <p className="muted">
              Photo analysis (local AI on your GPU), live sliders, “ask for changes”, and STL export all run
              offline on your own machine. No account or API key needed.
            </p>
            <ol className="run-steps">
              <li>
                Install <a href="https://www.python.org/downloads/" target="_blank" rel="noreferrer">Python 3.11+</a>,{" "}
                <a href="https://nodejs.org/" target="_blank" rel="noreferrer">Node.js</a> and{" "}
                <a href="https://ollama.com/download" target="_blank" rel="noreferrer">Ollama</a>, then run{" "}
                <code>ollama pull qwen2.5vl:7b</code>
              </li>
              <li>
                <a href={`${REPO}/archive/refs/heads/main.zip`}>Download DeskForge</a> (or clone it from GitHub) and unzip it
              </li>
              <li>Double-click <code>start.bat</code>. It sets everything up and opens the app.</li>
            </ol>
            <a className="btn primary" href={REPO} target="_blank" rel="noreferrer">Get the code →</a>
          </div>

          {pocketItems.length > 0 && (
            <>
              <div className="section-head">
                <h3>What the AI found on the sample desk</h3>
              </div>
              <div className="list">
                {pocketItems.map((it) => (
                  <div
                    key={it.id}
                    className="card item on"
                    onMouseEnter={() => setHoverId(it.id)}
                    onMouseLeave={() => setHoverId(null)}
                  >
                    <div className="item-head">
                      <span className="item-icon">{CATEGORY_ICONS[it.category] || "📦"}</span>
                      <span className="cable-name">{it.name}</span>
                      <span className="pill good">{Math.round(it.confidence * 100)}%</span>
                    </div>
                    <div className="item-dims muted small">
                      {Math.round(it.length_mm)} × {Math.round(it.width_mm)} × {Math.round(it.height_mm)} mm
                      {it.quantity > 1 && ` · ×${it.quantity}`}
                    </div>
                  </div>
                ))}
                {analysis.cables.map((c) => (
                  <div key={c.cable_type} className="card cable on">
                    <div className="item-head">
                      <span className="item-icon">🔌</span>
                      <span className="cable-name">
                        {CABLE_NAMES[c.cable_type] || c.cable_type} <span className="muted small">×{c.count} · Ø {c.diameter_mm} mm</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>

        <section className="right">
          <Viewer result={result} busy={!result && !error} hoverId={hoverId} />
          <div className="statsbar">
            {result ? (
              <>
                <Stat label="Footprint" value={`${result.size_mm[0]} × ${result.size_mm[1]}`} unit="mm" />
                <Stat label="Height" value={result.size_mm[2]} unit="mm" />
                <Stat label="Pockets" value={result.pockets.length} />
                <Stat label="Cable clips" value={result.slots.length} />
                <Stat label="Filament" value={`~${result.est_filament_g}`} unit="g PLA" />
                <a className="btn primary" href={result.stl_url} download="deskforge-demo-organizer.stl">
                  ⬇ Download demo STL
                </a>
              </>
            ) : (
              <span className="muted">{error ? `Couldn't load the demo model: ${error}` : "Loading the demo organizer…"}</span>
            )}
          </div>
          <div className="warnings info-note">
            Hover an item on the left to highlight its pocket. Drag to orbit, scroll to zoom.
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, unit }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit && <small> {unit}</small>}
      </span>
    </div>
  );
}
