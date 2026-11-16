import { useCallback, useEffect, useRef, useState } from "react";

// Webcam / phone-camera capture in a modal. Produces a JPEG File and hands it to
// onCapture, exactly like a dropped photo, so the rest of the pipeline is unchanged.

const ERRORS = {
  NotAllowedError: {
    title: "Camera permission was blocked.",
    hint: "Click the camera icon in the address bar, allow access, then try again.",
  },
  SecurityError: {
    title: "Camera permission was blocked.",
    hint: "Click the camera icon in the address bar, allow access, then try again.",
  },
  NotFoundError: {
    title: "No camera was found.",
    hint: "Plug in a webcam, or upload a photo taken on your phone instead.",
  },
  OverconstrainedError: {
    title: "That camera can't be used at this resolution.",
    hint: "Pick another camera from the list.",
  },
  NotReadableError: {
    title: "The camera is busy.",
    hint: "Close other apps using it (Zoom, Teams, Camera app) and try again.",
  },
};

function describeError(err) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      title: "This browser can't open the camera here.",
      hint: "Open the app at http://localhost:8000 in Chrome or Edge, or upload a photo instead.",
    };
  }
  return ERRORS[err?.name] || { title: "Could not start the camera.", hint: String(err?.message || err) };
}

export default function CameraCapture({ onCapture, onClose, reference }) {
  // Guide box shaped like the chosen reference object (long side horizontal).
  const refName = reference && reference.key !== "auto" ? reference.name : null;
  const aspect = reference?.length_mm && reference?.width_mm ? reference.width_mm / reference.length_mm : 0.63;
  const guideW = 120;
  const guideH = Math.max(28, Math.min(120, guideW * aspect));
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [status, setStatus] = useState("starting"); // starting | live | captured | error
  const [error, setError] = useState(null);
  const [snapshot, setSnapshot] = useState(null); // {url, blob}
  const [mirrored, setMirrored] = useState(false);
  const [flash, setFlash] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (id) => {
      stopStream();
      setStatus("starting");
      setError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        const video = id
          ? { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } };
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings?.() || {};
        // Mirror front-facing cameras so the preview feels natural; the saved photo is never mirrored.
        setMirrored(settings.facingMode === "user" || !settings.facingMode);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        // Device labels are only available after permission is granted.
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === "videoinput"));
        setDeviceId(settings.deviceId || id || "");
        setStatus("live");
      } catch (err) {
        stopStream();
        setError(describeError(err));
        setStatus("error");
      }
    },
    [stopStream]
  );

  useEffect(() => {
    start();
    return stopStream;
  }, [start, stopStream]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if ((e.key === " " || e.key === "Enter") && status === "live") {
        e.preventDefault();
        capture();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => () => snapshot && URL.revokeObjectURL(snapshot.url), [snapshot]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    video.pause(); // freeze the frame instantly while the JPEG encodes
    setStatus("encoding");
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError({ title: "Could not capture the frame.", hint: "Try again." });
          setStatus("error");
          return;
        }
        setSnapshot({ url: URL.createObjectURL(blob), blob });
        setStatus("captured");
      },
      "image/jpeg",
      0.92
    );
  };

  const usePhoto = () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = new File([snapshot.blob], `desk-${stamp}.jpg`, { type: "image/jpeg" });
    stopStream();
    onCapture(file);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal camera" role="dialog" aria-label="Take a photo of your desk">
        <div className="modal-head">
          <h3>📸 Take a photo of your desk</h3>
          {devices.length > 1 && status !== "captured" && (
            <select
              value={deviceId}
              onChange={(e) => {
                setDeviceId(e.target.value);
                start(e.target.value);
              }}
            >
              {devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          )}
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        <div className="camera-stage">
          <video
            ref={videoRef}
            playsInline
            muted
            className={mirrored ? "mirrored" : ""}
            style={{ visibility: ["live", "starting", "encoding"].includes(status) ? "visible" : "hidden" }}
          />
          {status === "captured" && snapshot && <img src={snapshot.url} alt="Captured desk" />}
          {status === "live" && refName && (
            <div className="camera-guide">
              <div className="card-outline" style={{ width: guideW, height: guideH }}>
                {refName} here for scale
              </div>
            </div>
          )}
          {status === "starting" && (
            <div className="camera-msg">
              <span className="spinner" /> Starting camera… allow access if your browser asks.
            </div>
          )}
          {status === "error" && error && (
            <div className="camera-msg error">
              <strong>{error.title}</strong>
              <span className="small">{error.hint}</span>
              <button className="btn tiny" onClick={() => start(deviceId || undefined)}>Try again</button>
            </div>
          )}
          {flash && <div className="camera-flash" />}
        </div>

        <div className="modal-foot">
          {status === "captured" ? (
            <>
              <button className="btn ghost" onClick={() => start(deviceId || undefined)}>↺ Retake</button>
              <button className="btn primary" onClick={usePhoto}>Use this photo →</button>
            </>
          ) : (
            <>
              <span className="muted small">
                Shoot from above and fit the whole desk in frame
                {refName ? `, with your ${refName} flat on the desk for scale.` : "."}
              </span>
              <button className="btn primary shutter" onClick={capture} disabled={status !== "live"}>
                ● Capture
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
