import { useEffect, useState } from "react";
import { scrollToId, usePageProgress } from "./hooks.js";

const LINKS = [
  ["story", "How it works"],
  ["vision", "AI vision"],
  ["features", "Features"],
  ["specs", "Specs"],
  ["faq", "FAQ"],
];

export default function SiteHeader() {
  const progress = usePageProgress();
  const [active, setActive] = useState("");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Highlight the nav link of the section currently in the middle of the screen.
  useEffect(() => {
    const ids = [...LINKS.map(([id]) => id), "generator"];
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <header className={`site-header ${scrolled ? "scrolled" : ""}`}>
      <a href="#top" className="site-brand" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
        <span className="brand-mark" aria-hidden>
          <svg viewBox="0 0 32 32"><rect x="3" y="9" width="26" height="16" rx="3" /><rect x="7" y="13" width="8" height="8" rx="1.5" className="cut" /><rect x="17" y="13" width="8" height="8" rx="1.5" className="cut" /></svg>
        </span>
        <span className="brand-word">DESKFORGE</span>
        <span className="brand-tag">CAD/AI · v1</span>
      </a>
      <nav className="site-nav" aria-label="Sections">
        {LINKS.map(([id, label], i) => (
          <a
            key={id}
            href={`#${id}`}
            className={active === id ? "active" : ""}
            onClick={(e) => { e.preventDefault(); scrollToId(id); }}
          >
            <span className="nav-num">0{i + 1}</span>
            {label}
          </a>
        ))}
      </nav>
      <button className={`btn primary header-cta ${active === "generator" ? "in-gen" : ""}`} onClick={() => scrollToId("generator")}>
        Open generator ↓
      </button>
      <div className="progress-line" style={{ transform: `scaleX(${progress})` }} />
    </header>
  );
}
