import { describe, expect, it } from "vitest";
import { createAIReceipt } from "../server/ai-receipt.js";

describe("AI receipt sanitizer", () => {
  it("returns only display-safe usage and Gateway cost fields", () => {
    const receipt = createAIReceipt(
      {
        usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150, reasoningTokens: 11 },
        providerMetadata: {
          gateway: { cost: "0.000731", secretInternalField: "do-not-forward" },
          provider: { raw: "private" },
        },
      },
      { model: "anthropic/claude-sonnet-4.6", latencyMs: 8120, stage: "generation" },
    );

    expect(receipt).toEqual({
      stage: "generation",
      model: "anthropic/claude-sonnet-4.6",
      latencyMs: 8120,
      tokens: { input: 120, output: 30, total: 150 },
      costUsd: 0.000731,
    });
    expect(JSON.stringify(receipt)).not.toContain("secretInternalField");
  });

  it("uses null for unavailable billing data", () => {
    expect(createAIReceipt({}, { model: "test", latencyMs: 2, stage: "decision" })).toMatchObject({
      tokens: { input: null, output: null, total: null },
      costUsd: null,
    });
  });
});
