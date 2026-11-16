import { useState } from "react";

const QA = [
  ["Does it need the internet or an API key?",
    "No. With Ollama installed, a local vision model (Qwen2.5-VL) runs on your own computer for free. If you add an Anthropic API key, it uses Claude instead, which is faster and more accurate."],
  ["How accurate are the measurements?",
    "With a reference object of known size in the shot, typically within a few millimetres. Without one the AI estimates from typical product sizes. Either way every dimension is a slider, and the 3D model updates as you drag."],
  ["What can I change by typing?",
    "Anything the generator controls: wall and floor thickness, fit clearance, pocket depth, bed size, rounded corners, labels, cable clips, front engraving, and adding, removing or resizing items. Things like hinges or lids aren't possible, and it tells you so instead of pretending."],
  ["Which 3D printers does it work with?",
    "Any FDM printer. Pick your bed size (Ender 3, Prusa MK4, Bambu or larger) and the layout packs itself to fit. Print in PLA at 0.2 mm layers with no supports."],
  ["What if the AI misses something?",
    "Click + Add to make a pocket for any item, untick anything you don't want, or just type “add a pocket for my watch”."],
];

export default function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="faq section" id="faq">
      <div className="sec-head">
        <div className="section-label mono">[ 05 / FAQ ] <span className="dots">·· · ··· ·</span></div>
        <h2>Questions, answered.</h2>
      </div>
      <div className="faq-list">
        {QA.map(([q, a], i) => (
          <div key={q} className={`faq-item ${open === i ? "open" : ""}`}>
            <button className="faq-q" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
              <span className="mono">Q{i + 1}</span>
              <span>{q}</span>
              <span className="faq-plus" aria-hidden>+</span>
            </button>
            <div className="faq-a">
              <p>{a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
