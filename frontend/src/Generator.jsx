import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import Dropzone from "./components/Dropzone.jsx";
import AnalysisPanel, { toEditableState } from "./components/AnalysisPanel.jsx";
import SettingsPanel, { DEFAULT_SETTINGS } from "./components/SettingsPanel.jsx";
import Viewer from "./components/Viewer.jsx";
import PromptBar from "./components/PromptBar.jsx";
import { loadReference } from "./components/ReferencePicker.jsx";

const DRAFT_DEBOUNCE_MS = 250;
const FULL_DEBOUNCE_MS = 1400;

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list.slice(-3), { id, kind: "error", ...t }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.ttl || 7000);
  }, []);
  const dismiss = (id) => setToasts((list) => list.filter((x) => x.id !== id));
  return { toasts, push, dismiss };
}

function buildPayload(items, cables, settings) {
  return {
    items: items
      .filter((i) => i.include)
      .map((i) => ({
        id: i.id,
        label: (i.label || "Item").trim().slice(0, 40) || "Item",
        length_mm: i.length_mm,
        width_mm: i.width_mm,
        height_mm: i.height_mm,
        quantity: i.quantity,
      })),
    cables: settings.cable_rail
      ? cables.filter((c) => c.include).map((c) => ({ label: c.label, diameter_mm: c.diameter_mm, count: c.count }))
      : [],
    settings,
  };
}

const STEPS = ["Snap", "Analyse", "Tune", "Print"];

export default function Generator() {
  const [health, setHealth] = useState(null);
  const [phase, setPhase] = useState("upload"); // upload | analyzing | review
  const [photoUrl, setPhotoUrl] = useState(null);
  const [meta, setMeta] = useState(null); // {analysis, source, model, warnings}
  const [items, setItems] = useState([]);
  const [cables, setCables] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [result, setResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genWarnings, setGenWarnings] = useState([]);
  const [hoverId, setHoverId] = useState(null);
  const [analyzeStart, setAnalyzeStart] = useState(0);
  const [reference, setReference] = useState(loadReference);
  const [, setTick] = useState(0);
  const [history, setHistory] = useState([]); // undo stack for prompt edits
  const { toasts, push, dismiss } = useToasts();
  const genCtrl = useRef(null);
  const sectionRef = useRef(null);

  const scrollIntoView = () =>
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const applyEdit = (next) => {
    setHistory((h) => [...h.slice(-9), { items, cables, settings }]);
    setItems(next.items);
    setCables(next.cables);
    setSettings(next.settings);
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setItems(last.items);
    setCables(last.cables);
    setSettings(last.settings);
    setHistory((h) => h.slice(0, -1));
  };

  useEffect(() => {
    api.health().then(setHealth).catch((e) => push({ title: e.message, hint: e.hint }));
  }, [push]);

  const loadAnalysis = (resp) => {
    const { items, cables } = toEditableState(resp.analysis);
    setMeta(resp);
    setItems(items);
    setCables(cables);
    setResult(null);
    setHistory([]);
    setPhase("review");
    scrollIntoView();
    resp.warnings?.forEach((w) => push({ kind: "info", title: w }));
  };

  const analyzeFile = async (file) => {
    setPhotoUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setPhase("analyzing");
    setAnalyzeStart(Date.now());
    scrollIntoView();
    try {
      // Re-check which AI is available (Ollama may have been started since page load).
      const h = await api.health().catch(() => health);
      if (h) setHealth(h);
      const resp = await api.analyze(file, { demoFallback: h?.provider === "demo", reference });
      loadAnalysis(resp);
    } catch (e) {
      setPhase("upload");
      push({
        title: e.message,
        hint: e.hint,
        action: { label: "Use demo desk", run: runDemo },
      });
    }
  };

  // Re-render once a second while analysing so the elapsed timer updates.
  useEffect(() => {
    if (phase !== "analyzing") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const runDemo = async () => {
    setAnalyzeStart(Date.now());
    setPhase("analyzing");
    try {
      loadAnalysis(await api.demo());
    } catch (e) {
      setPhase("upload");
      push({ title: e.message, hint: e.hint });
    }
  };

  const reset = () => {
    genCtrl.current?.abort();
    setPhase("upload");
    setMeta(null);
    setResult(null);
    setItems([]);
    setCables([]);
    setGenWarnings([]);
  };

  // Live regeneration, two stages: while sliders move, a fast "draft" build
  // without engraved labels (~1 s); once the user pauses, the full build.
  const hasResult = result !== null;
  useEffect(() => {
    if (phase !== "review") return;
    const payload = buildPayload(items, cables, settings);
    if (payload.items.length === 0) {
      genCtrl.current?.abort();
      setResult(null);
      setGenerating(false);
      return;
    }
    const run = async (body, draft) => {
      genCtrl.current?.abort();
      const ctrl = new AbortController();
      genCtrl.current = ctrl;
      setGenerating(draft ? "draft" : "full");
      try {
        const res = await api.generate(body, { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        setResult({ ...res, draft });
        setGenWarnings(res.warnings || []);
      } catch (e) {
        if (e.name !== "AbortError") push({ title: e.message, hint: e.hint });
      } finally {
        if (genCtrl.current === ctrl) setGenerating(false);
      }
    };
    const timers = [];
    const wantsDraft = hasResult && settings.engrave_labels;
    if (wantsDraft) {
      const draftBody = { ...payload, settings: { ...payload.settings, engrave_labels: false } };
      timers.push(setTimeout(() => run(draftBody, true), DRAFT_DEBOUNCE_MS));
    }
    timers.push(setTimeout(() => run(payload, false), wantsDraft ? FULL_DEBOUNCE_MS : DRAFT_DEBOUNCE_MS));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cables, settings, phase, push]);

  const stepIndex = phase === "upload" ? 0 : phase === "analyzing" ? 1 : result ? 3 : 2;

  return (
    <div className="generator" ref={sectionRef}>
      <header className="gen-bar">
        <div className="gen-title">
          <span className="mono-label">[ G / GENERATOR ]</span>
          <span className="gen-sub">photo → parametric CAD → STL</span>
        </div>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < stepIndex ? "done" : i === stepIndex ? "now" : ""}>
              <span>{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <div className="status">
          {health && (
            <span
              className={`pill ${health.provider === "demo" ? "mid" : "good"}`}
              title={health.provider === "local" ? "Free local AI running on this computer" : undefined}
            >
              {health.provider === "claude" && `● ${health.vision_model}`}
              {health.provider === "local" && `● ${health.vision_model} · local`}
              {health.provider === "demo" && "● demo mode"}
            </span>
          )}
          {phase !== "upload" && (
            <button className="btn ghost tiny" onClick={reset}>New photo</button>
          )}
        </div>
      </header>

      {phase === "upload" && (
        <main className="landing">
          <Dropzone onFile={analyzeFile} onDemo={runDemo} busy={false}
            provider={health?.provider}
            reference={reference}
            setReference={setReference}
          />
        </main>
      )}

      {phase === "analyzing" && (
        <main className="landing">
          <div className="analyzing">
            {photoUrl && <img src={photoUrl} alt="Your desk" />}
            <div className="scanline" />
            <div className="analyzing-text">
              <span className="spinner" />
              {health?.provider === "local"
                ? `${health.vision_model} is analysing on this computer…`
                : "Claude is cataloguing your clutter…"}
              <span className="muted">{Math.round((Date.now() - analyzeStart) / 1000)} s</span>
            </div>
            {health?.provider === "local" && (
              <div className="analyzing-sub">Local AI is free but slower - about a minute on this laptop's GPU.</div>
            )}
          </div>
        </main>
      )}

      {phase === "review" && meta && (
        <main className="workspace">
          <aside className="left">
            {photoUrl && meta.source !== "demo" && (
              <img className="photo" src={photoUrl} alt="Your desk" />
            )}
            <AnalysisPanel
              meta={meta}
              items={items}
              cables={cables}
              setItems={setItems}
              setCables={setCables}
              onHover={setHoverId}
            />
          </aside>
          <section className="right">
            <Viewer result={result} busy={generating} hoverId={hoverId} />
            <div className="statsbar">
              {result ? (
                <>
                  <Stat label="Footprint" value={`${result.size_mm[0]} × ${result.size_mm[1]}`} unit="mm" />
                  <Stat label="Height" value={result.size_mm[2]} unit="mm" />
                  <Stat label="Pockets" value={result.pockets.length} />
                  <Stat label="Cable clips" value={result.slots.length} />
                  <Stat label="Filament" value={`~${result.est_filament_g}`} unit="g PLA" />
                  <Stat label="CAD compile" value={(result.generation_ms / 1000).toFixed(1)} unit="s" />
                  <a
                    className={`btn primary ${result.draft || generating ? "pending" : ""}`}
                    href={result.stl_url}
                    download
                    title={result.draft ? "Final build with labels is on its way" : "Download the printable STL"}
                  >
                    ⬇ Download STL
                  </a>
                </>
              ) : (
                <span className="muted">Waiting for a model…</span>
              )}
            </div>
            {genWarnings.length > 0 && (
              <div className="warnings">
                {genWarnings.map((w) => (
                  <div key={w}>⚠ {w}</div>
                ))}
              </div>
            )}
            <PromptBar
              items={items}
              cables={cables}
              settings={settings}
              provider={health?.provider}
              onApply={applyEdit}
              canUndo={history.length > 0}
              onUndo={undo}
              onError={(e) => push({ title: e.message, hint: e.hint })}
            />
            <SettingsPanel settings={settings} setSettings={setSettings} />
          </section>
        </main>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <div>
              <strong>{t.title}</strong>
              {t.hint && <div className="small">{t.hint}</div>}
            </div>
            {t.action && (
              <button
                className="btn tiny"
                onClick={() => {
                  dismiss(t.id);
                  t.action.run();
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="icon-btn" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        ))}
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
