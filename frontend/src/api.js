// Thin fetch wrapper: every backend error arrives as {error: {code, message, hint}}.

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
  demo: () => request("/api/demo"),
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
