export async function requestJevInterpretation(
  prompt,
  currentState,
  capabilitiesOrFetch = [],
  maybeFetch = fetch,
) {
  const capabilities = typeof capabilitiesOrFetch === "function" ? [] : capabilitiesOrFetch;
  const fetchFn = typeof capabilitiesOrFetch === "function" ? capabilitiesOrFetch : maybeFetch;
  const response = await fetchFn("/api/interpret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, currentState, capabilities }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "The interpretation request failed.");
    error.code = payload.code || "INTERPRETATION_FAILED";
    throw error;
  }

  return payload;
}

export async function requestCapabilityProposal(
  prompt,
  currentState,
  proposedState,
  capabilitiesOrFetch = [],
  maybeFetch = fetch,
) {
  const capabilities = typeof capabilitiesOrFetch === "function" ? [] : capabilitiesOrFetch;
  const fetchFn = typeof capabilitiesOrFetch === "function" ? capabilitiesOrFetch : maybeFetch;
  const response = await fetchFn("/api/generate-capability", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, currentState, proposedState, capabilities }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "The capability generation request failed.");
    error.code = payload.code || "CAPABILITY_GENERATION_FAILED";
    throw error;
  }

  return payload;
}
