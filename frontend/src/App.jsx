import SiteHeader from "./site/SiteHeader.jsx";
import Hero from "./site/Hero.jsx";
import Story from "./site/Story.jsx";
import VisionTerminal from "./site/VisionTerminal.jsx";
import Features from "./site/Features.jsx";
import SpecSheets from "./site/SpecSheets.jsx";
import Faq from "./site/Faq.jsx";
import Footer from "./site/Footer.jsx";
import Generator from "./Generator.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

export default function App() {
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
          <ErrorBoundary>
            <Generator />
          </ErrorBoundary>
        </section>
      </main>
      <Footer />
    </>
  );
}
