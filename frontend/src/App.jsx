import { useEffect } from "react";
import SiteHeader from "./site/SiteHeader.jsx";
import Hero from "./site/Hero.jsx";
import Story from "./site/Story.jsx";
import VisionTerminal from "./site/VisionTerminal.jsx";
import Features from "./site/Features.jsx";
import SpecSheets from "./site/SpecSheets.jsx";
import Faq from "./site/Faq.jsx";
import Footer from "./site/Footer.jsx";
import Generator from "./Generator.jsx";
import StaticGenerator from "./StaticGenerator.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { STATIC } from "./api.js";

// Deep links like /#generator: the sections only exist after React renders, so the
// browser's own jump-to-anchor misses them. Scroll once the page has mounted.
function useHashScroll() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 120);
    return () => clearTimeout(t);
  }, []);
}

export default function App() {
  useHashScroll();
  return (
    <>
      <a className="skip-link" href="#generator">Skip to the generator</a>
      <SiteHeader />
      <main>
        <Hero />
        <Story />
        <VisionTerminal />
        <Features />
        <SpecSheets />
        <Faq />
        <section className="generator-section" id="generator">
          <ErrorBoundary>{STATIC ? <StaticGenerator /> : <Generator />}</ErrorBoundary>
        </section>
      </main>
      <Footer />
    </>
  );
}
