import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

// "Ask for changes" - plain-English edits to the CAD. The AI only changes the same
// parameters the sliders control, so every result is still printable. The change
// list shown afterwards is computed by the server from the real before/after state.

const EXAMPLES = [
  "Make the walls 3 mm thick",
  "Engrave DESKFORGE on the front",
  "Looser fit for everything",
  "Add a pocket for my watch",
  "Deeper pockets",
  "Remove the cable clips",
];

const pickItem = (i) => ({
  id: i.id,
  label: (i.label || "Item").slice(0, 40),
  length_mm: i.length_mm,
  width_mm: i.width_mm,
  height_mm: i.height_mm,
  quantity: i.quantity,
  include: i.include,
});
const pickCable = (c) => ({ id: c.id, label: c.label.slice(0, 40), diameter_mm: c.diameter_mm, count: c.count, include: c.include });

export default function PromptBar({ items, cables, settings, provider, onApply, canUndo, onUndo, onError }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(0);
  const [, setTick] = useState(0);
  const [outcome, setOutcome] = useState(null); // {prompt, explanation, unsupported, seconds}
  const inputRef = useRef(null);
  const ctrl = useRef(null);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [busy]);

  useEffect(() => () => ctrl.current?.abort(), []);

  const noAI = provider === "demo";

  const submit = async (prompt) => {
    const p = (prompt ?? text).trim();
    if (p.length < 2 || busy) return;
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setBusy(true);
    setStarted(Date.now());
    setOutcome(null);
    try {
      const res = await api.edit(
        { prompt: p, items: items.map(pickItem), cables: cables.map(pickCable), settings },
        { signal: ctrl.current.signal }
      );
      // Keep UI-only fields (category, confidence...) for items that still exist.
      const byId = Object.fromEntries(items.map((i) => [i.id, i]));
      const nextItems = res.items.map((i) =>
        byId[i.id] ? { ...byId[i.id], ...i } : { ...i, category: "misc", custom: true }
      );
      const cById = Object.fromEntries(cables.map((c) => [c.id, c]));
      const nextCables = res.cables.map((c) => (cById[c.id] ? { ...cById[c.id], ...c } : c));
      onApply({ items: nextItems, cables: nextCables, settings: { ...settings, ...res.settings } });
      setOutcome({ prompt: p, explanation: res.explanation, unsupported: res.unsupported, seconds: res.seconds });
      setText("");
    } catch (e) {
      if (e.name !== "AbortError") onError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`prompt-bar card ${busy ? "busy" : ""}`}>
      <div className="prompt-head">
        <span className="mono-label">[ ✦ ASK FOR CHANGES ]</span>
        {canUndo && !busy && (
          <button className="btn tiny ghost" onClick={() => { onUndo(); setOutcome(null); }}>
            ↶ Undo last change
          </button>
        )}
      </div>
      <form
        className="prompt-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={inputRef}
          value={text}
          maxLength={300}
          disabled={busy || noAI}
          onChange={(e) => setText(e.target.value)}
          placeholder={noAI ? "Needs the local AI (Ollama) or a Claude key" : "e.g. make the pen slot fit 6 pens and engrave APEX on the front"}
        />
        {busy ? (
          <button type="button" className="btn" onClick={() => ctrl.current?.abort()}>
            <span className="spinner" /> {Math.round((Date.now() - started) / 1000)} s · Cancel
          </button>
        ) : (
          <button type="submit" className="btn primary" disabled={text.trim().length < 2 || noAI}>
            Apply ↵
          </button>
        )}
      </form>
      {!busy && !outcome && (
        <div className="prompt-chips">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip" disabled={noAI} onClick={() => { setText(ex); inputRef.current?.focus(); }}>
              {ex}
            </button>
          ))}
        </div>
      )}
      {busy && (
        <div className="prompt-status muted small">
          {provider === "local" ? "Local AI is rewriting the parameters - usually 15–30 s…" : "Claude is rewriting the parameters…"}
        </div>
      )}
      {outcome && (
        <div className="prompt-outcome">
          <div className="small muted">
            “{outcome.prompt}” · {outcome.seconds}s
          </div>
          <ul>
            {outcome.explanation.map((e) => (
              <li key={e}>✓ {e}</li>
            ))}
            {outcome.unsupported.map((u) => (
              <li key={u} className="unsupported">✕ Not possible: {u}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
