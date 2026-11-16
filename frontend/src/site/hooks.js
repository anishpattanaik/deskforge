import { useEffect, useRef, useState } from "react";

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Whole-page scroll progress 0..1 (for the header progress line). */
export function usePageProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setP(max > 0 ? window.scrollY / max : 0);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return p;
}

/**
 * Progress 0..1 through a tall section with a sticky child, written into a ref
 * (no re-render per scroll event - consumers read it in requestAnimationFrame/useFrame).
 */
export function useSectionProgressRef(sectionRef) {
  const progress = useRef(0);
  useEffect(() => {
    const update = () => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      progress.current = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [sectionRef]);
  return progress;
}

/** True once the element has scrolled into view (stays true). */
export function useInView(ref, { threshold = 0.2, once = true } = {}) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) setInView(false);
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold, once]);
  return inView;
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/_[]·";

/** Text that "decodes" from random glyphs into the target string (engineering-readout feel). */
export function useScramble(text, active = true, durationMs = 700) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      setOut(text);
      return;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const revealed = Math.floor(t * text.length);
      let s = text.slice(0, revealed);
      for (let i = revealed; i < text.length; i++) {
        s += text[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      setOut(s);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, active, durationMs]);
  return out;
}

/** Number that counts up when `active` becomes true. */
export function useCountUp(target, active, durationMs = 1400, decimals = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion()) {
      setV(target);
      return;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durationMs]);
  return v.toFixed(decimals);
}

export function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}
