export async function requestArtComposition(prompt, fetchFn = fetch) {
  const response = await fetchFn("/api/compose-art", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "The composition request failed.");
    error.code = payload.code || "COMPOSITION_FAILED";
    throw error;
  }
  return payload;
}
