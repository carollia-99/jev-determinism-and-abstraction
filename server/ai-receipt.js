function finiteNumber(value) {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return Number.isFinite(number) ? number : null;
}

export function createAIReceipt(result, { model, latencyMs, stage }) {
  const inputTokens = finiteNumber(result?.usage?.inputTokens);
  const outputTokens = finiteNumber(result?.usage?.outputTokens);
  const reportedTotal = finiteNumber(result?.usage?.totalTokens);
  const totalTokens =
    reportedTotal ??
    (inputTokens !== null || outputTokens !== null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null);
  const costUsd = finiteNumber(result?.providerMetadata?.gateway?.cost);

  return {
    stage,
    model,
    latencyMs,
    tokens: {
      input: inputTokens,
      output: outputTokens,
      total: totalTokens,
    },
    costUsd,
  };
}
