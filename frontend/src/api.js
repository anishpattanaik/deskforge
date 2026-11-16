// Thin fetch wrapper: every backend error arrives as {error: {code, message, hint}}.

// STATIC = built for GitHub Pages (no server). The site then reads pre-built demo
// files from public/demo/ instead of calling the API.
export const STATIC = import.meta.env.VITE_STATIC === "1";
export const asset = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

async function staticJson(path) {
  const res = await fetch(asset(path));
  if (!res.ok) throw new Error(`Missing demo file ${path}`);
  return res.json();
}

/** The demo organizer: generated live by the server, or pre-built for the static site. */
export async function loadDemoModel() {
  if (STATIC) {
    const model = await staticJson("demo/model.json");
    return { ...model, stl_url: asset(model.stl_url) };
  }
  const demo = await api.demo();
  const items = demo.analysis.items
    .filter((i) => i.include_in_organizer)
    .map((i, n) => ({ id: `d${n}`, label: i.name, length_mm: i.length_mm, width_mm: i.width_mm, height_mm: i.height_mm, quantity: i.quantity }));
  const cables = demo.analysis.cables.map((c) => ({ label: c.cable_type, diameter_mm: c.diameter_mm, count: c.count }));
  return api.generate({ items, cables, settings: { front_text: "DESKFORGE" } });
}

export class ApiError extends Error {
  constructor(message, { code = "error", hint = null, status = 0 } = {}) {
    super(message);
    this.code = code;
    this.hint = hint;
    this.status = status;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, options);
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError("Cannot reach the DeskForge server.", {
      code: "network",
      hint: "Is the backend running on port 8000?",
    });
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const e = body?.error;
    throw new ApiError(e?.message || `Request failed (${res.status})`, {
      code: e?.code,
      hint: e?.hint,
      status: res.status,
    });
  }
  return body;
}

export const api = {
  health: () => request("/api/health"),
  demo: () => (STATIC ? staticJson("demo/analysis.json") : request("/api/demo")),
  references: () => request("/api/references"),
  analyze: (file, { demoFallback = false, reference = null, signal } = {}) => {
    const form = new FormData();
    form.append("file", file);
    if (reference) {
      form.append("ref_key", reference.key);
      if (reference.key === "custom") {
        form.append("ref_name", reference.name || "");
        form.append("ref_length_mm", String(reference.length_mm ?? ""));
        form.append("ref_width_mm", String(reference.width_mm ?? ""));
      }
    }
    return request(`/api/analyze?demo_fallback=${demoFallback}`, {
      method: "POST",
      body: form,
      signal,
    });
  },
  edit: (payload, { signal } = {}) =>
    request("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    }),
  generate: (payload, { signal } = {}) =>
    request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    }),
};
