import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Grid, Html, OrbitControls } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import ErrorBoundary from "./ErrorBoundary.jsx";

// Fetch + parse an STL; keep showing the previous geometry until the next is ready
// so dragging a slider morphs the model instead of flashing.
export function useStlGeometry(url) {
  const [state, setState] = useState({ geometry: null, error: null });
  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`STL download failed (${r.status})`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        const geo = new STLLoader().parse(buf);
        geo.computeVertexNormals();
        setState((prev) => {
          prev.geometry?.dispose();
          return { geometry: geo, error: null };
        });
      })
      .catch((err) => {
        if (err.name !== "AbortError") setState((s) => ({ ...s, error: err.message }));
      });
    return () => ctrl.abort();
  }, [url]);
  return state;
}

function Organizer({ geometry, result, hoverId, showLabels, wireframe }) {
  const [w, d] = result.size_mm;
  const hovered = result.pockets.find((p) => p.id === hoverId);
  return (
    // CadQuery is Z-up, three.js is Y-up: rotate, then centre the tray on the origin.
    <group rotation={[-Math.PI / 2, 0, 0]} position={[-w / 2, 0, d / 2]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color="#ff8a3d" roughness={0.55} metalness={0.05} wireframe={wireframe} />
      </mesh>
      {hovered && (
        <mesh position={[hovered.x + hovered.w / 2, hovered.y + hovered.d / 2, 2 + hovered.wall_h / 2]}>
          <boxGeometry args={[hovered.w, hovered.d, hovered.wall_h]} />
          <meshBasicMaterial color="#5ee1ff" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
      {showLabels &&
        result.pockets.map((p) => (
          <Html
            key={p.id}
            position={[p.x + p.w / 2, p.y + p.d / 2, p.wall_h + 6]}
            center
            distanceFactor={260}
            zIndexRange={[10, 0]}
          >
            <div className={`tag ${p.id === hoverId ? "hot" : ""}`}>{p.label}</div>
          </Html>
        ))}
    </group>
  );
}

export default function Viewer({ result, busy, hoverId }) {
  const { geometry, error } = useStlGeometry(result?.stl_url);
  const [showLabels, setShowLabels] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [spin, setSpin] = useState(false);
  const span = useMemo(() => (result ? Math.max(result.size_mm[0], result.size_mm[1]) : 220), [result]);

  return (
    <div className="viewer">
      <ErrorBoundary
        fallback={(err) => (
          <div className="viewer-empty">
            <p>3D viewer failed: {String(err?.message || err)}</p>
            <p className="muted small">Your browser may not support WebGL. The STL download still works.</p>
          </div>
        )}
      >
        <Canvas shadows camera={{ position: [span * 0.75, span * 0.9, span * 1.05], fov: 40, near: 1, far: 5000 }}>
          <color attach="background" args={["#14161c"]} />
          {/* Local lights only - no HDR download, so the viewer works offline. */}
          <hemisphereLight args={["#dfe8ff", "#2a2118", 0.9]} />
          <directionalLight position={[150, 300, 120]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} />
          <directionalLight position={[-200, 120, -150]} intensity={0.5} />
          {geometry && result && (
            <Organizer geometry={geometry} result={result} hoverId={hoverId} showLabels={showLabels} wireframe={wireframe} />
          )}
          <ContactShadows position={[0, -0.1, 0]} opacity={0.5} scale={span * 2} blur={2.5} far={60} />
          <Grid
            position={[0, -0.2, 0]}
            args={[600, 600]}
            cellSize={10}
            cellThickness={0.5}
            cellColor="#2a2f3a"
            sectionSize={50}
            sectionThickness={1}
            sectionColor="#3a4150"
            fadeDistance={900}
            infiniteGrid
          />
          <OrbitControls makeDefault autoRotate={spin} autoRotateSpeed={1.2} maxPolarAngle={Math.PI / 2.05} />
        </Canvas>
      </ErrorBoundary>

      {!result && !busy && (
        <div className="viewer-empty overlay">
          <p>Your organizer appears here.</p>
          <p className="muted small">Tick at least one item to give it a pocket.</p>
        </div>
      )}
      {busy ? (
        <div className="viewer-badge">
          <span className="spinner" /> {busy === "draft" ? "Draft preview…" : "Compiling CAD…"}
        </div>
      ) : (
        result?.draft && <div className="viewer-badge">Draft · labels pending</div>
      )}
      {error && <div className="viewer-badge error">{error}</div>}

      <div className="viewer-tools">
        <button className={`chip ${showLabels ? "active" : ""}`} onClick={() => setShowLabels(!showLabels)}>Labels</button>
        <button className={`chip ${wireframe ? "active" : ""}`} onClick={() => setWireframe(!wireframe)}>Wireframe</button>
        <button className={`chip ${spin ? "active" : ""}`} onClick={() => setSpin(!spin)}>Turntable</button>
      </div>
    </div>
  );
}
