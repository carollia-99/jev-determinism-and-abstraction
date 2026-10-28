export async function requestArtComposition(prompt, modeOrOptions = "jev", requestFetch = fetch) {
  const options = typeof modeOrOptions === "object" && modeOrOptions !== null
    ? modeOrOptions
    : { mode: typeof modeOrOptions === "string" ? modeOrOptions : "jev" };
  const mode = options.mode ?? "jev";
  const fetchFn = typeof modeOrOptions === "function" ? modeOrOptions : requestFetch;
  const body = { prompt, mode };
  if ((mode === "model" || mode === "code") && options.model) body.model = options.model;
  const response = await fetchFn("/api/compose-art", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "The composition request failed.");
    error.code = payload.code || "COMPOSITION_FAILED";
    throw error;
  }
  return payload;
}
