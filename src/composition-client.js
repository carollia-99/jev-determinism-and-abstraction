async function readCompositionStream(response, onProgress) {
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error("The live composition stream is unavailable.");
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  let lastProgress = null;

  const consumeLine = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "progress") {
      lastProgress = event.progress;
      onProgress?.(event.progress);
    }
    if (event.type === "result") result = event.body;
    if (event.type === "error") {
      const error = new Error(event.body?.error || "The composition request failed.");
      error.code = event.body?.code || "COMPOSITION_FAILED";
      error.detail = event.body?.detail ?? null;
      error.stage = event.body?.stage ?? lastProgress?.stage ?? null;
      throw error;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(consumeLine);
    if (done) break;
  }
  consumeLine(buffer);
  if (!result) throw new Error("The composition stream ended before returning artwork.");
  return result;
}

export async function requestArtComposition(prompt, modeOrOptions = "jev", requestFetch = fetch) {
  const options = typeof modeOrOptions === "object" && modeOrOptions !== null
    ? modeOrOptions
    : { mode: typeof modeOrOptions === "string" ? modeOrOptions : "jev" };
  const mode = options.mode ?? "jev";
  const fetchFn = typeof modeOrOptions === "function" ? modeOrOptions : requestFetch;
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const body = { prompt, mode };
  if (mode === "model" && options.model) body.model = options.model;
  if (mode === "image" && options.model) body.model = options.model;
  if (mode === "jev" && options.live === true) body.live = true;
  const response = await fetchFn("/api/compose-art", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(onProgress ? { Accept: "application/x-ndjson" } : {}),
    },
    body: JSON.stringify(body),
  });
  const isStream = String(response.headers?.get?.("content-type") ?? "").includes("application/x-ndjson");
  if (isStream) return readCompositionStream(response, onProgress);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "The composition request failed.");
    error.code = payload.code || "COMPOSITION_FAILED";
    error.detail = payload.detail ?? null;
    error.stage = payload.stage ?? null;
    throw error;
  }
  return payload;
}
