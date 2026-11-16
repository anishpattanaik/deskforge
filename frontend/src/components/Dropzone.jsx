import { useEffect, useRef, useState } from "react";
import CameraCapture from "./CameraCapture.jsx";
import ReferencePicker, { isReferenceValid, referenceLabel } from "./ReferencePicker.jsx";

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_BYTES = 15 * 1024 * 1024;

export default function Dropzone({ onFile, onDemo, busy, provider, reference, setReference }) {
  const inputRef = useRef(null);
  const captureRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const openCamera = () => {
    if (navigator.mediaDevices?.getUserMedia) setCameraOpen(true);
    else captureRef.current?.click(); // phones on plain http: use the native camera app
  };

  const take = (file) => {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/") && !ACCEPT.includes(file.type)) {
      setError("That isn't an image - drop a JPG, PNG or WebP photo.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That photo is over 15 MB - try a smaller one.");
      return;
    }
    if (!isReferenceValid(reference)) {
      setError("Finish describing your reference object first (name + length + width).");
      return;
    }
    onFile(file);
  };

  // Paste a screenshot / photo straight from the clipboard.
  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
      if (item) take(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  return (
    <div className="upload-wrap">
      <div
        className={`dropzone ${drag ? "drag" : ""} ${busy ? "busy" : ""}`}
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!busy) take(e.dataTransfer.files?.[0]);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => take(e.target.files?.[0])}
        />
        <div className="dz-icon">📷</div>
        <h2>Drop a photo of your messy desk</h2>
        <p>or click to browse · or paste from the clipboard</p>
        {reference.key !== "auto" && (
          <div className="dz-tip">
            <strong>Tip:</strong> put your <strong>{referenceLabel(reference)}</strong> flat on the desk,
            fully visible - it gives the AI a true scale for millimetre-accurate pockets.
          </div>
        )}
      </div>
      <ReferencePicker value={reference} onChange={setReference} />
      {error && <div className="inline-error">{error}</div>}
      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => take(e.target.files?.[0])}
      />
      <div className="upload-actions">
        <button className="btn primary" onClick={openCamera} disabled={busy}>
          📸 Take photo
        </button>
        <button className="btn ghost" onClick={onDemo} disabled={busy}>
          ✨ Try the demo desk
        </button>
        {provider === "demo" && (
          <span className="muted small">
            No API key or local AI found - photos fall back to demo data.
          </span>
        )}
        {provider === "local" && (
          <span className="muted small">Free local AI - photos are analysed on this computer.</span>
        )}
      </div>
      {cameraOpen && (
        <CameraCapture
          reference={reference}
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => {
            setCameraOpen(false);
            take(file);
          }}
        />
      )}
    </div>
  );
}
