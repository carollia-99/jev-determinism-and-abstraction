import { describe, expect, it, vi } from "vitest";
import { composeArtWithJev, MAX_ART_DECISION_COUNT, validateComposeRequest } from "../server/compose-with-jev.js";

function fakeAnswers(questions) {
  return Object.fromEntries(Object.entries(questions).map(([key, question]) => {
    if (question.type === "boolean") return [key, { type: "boolean", probability: 0.8 }];
    if (question.type === "score") return [key, { type: "score", score: 1, probabilities: { 0: 0.1, 1: 0.8, 2: 0.1 } }];
    const choice = Object.keys(question.criteria)[0];
    return [key, { type: "choice", choice, probabilities: { [choice]: 0.8 } }];
  }));
}

function fakeResult(questions) {
  return {
    answers: fakeAnswers(questions),
    response: { modelId: "typesafe-ai/jev-test" },
    usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    providerMetadata: { gateway: { cost: "0.00042" } },
  };
}

describe("Jev art composition", () => {
  it("rejects blank and oversized prompts", () => {
    expect(() => validateComposeRequest({ prompt: "  " })).toThrow("Prompt is required");
    expect(() => validateComposeRequest({ prompt: "x".repeat(501) })).toThrow("500 characters");
  });

  it("establishes a thesis, asks only relevant questions, and returns both receipts", async () => {
    const decideFn = vi.fn(async ({ questions }) => fakeResult(questions));
    const result = await composeArtWithJev({ prompt: "luminous rain" }, { decideFn, model: {}, modelId: "fallback" });
    expect(decideFn).toHaveBeenCalledTimes(2);
    expect(Object.keys(decideFn.mock.calls[0][0].questions)).toHaveLength(8);
    expect(Object.keys(decideFn.mock.calls[1][0].questions).length).toBeLessThan(80);
    expect(result.decisionCount).toBeLessThan(MAX_ART_DECISION_COUNT);
    expect(result.skippedDecisionCount).toBeGreaterThan(0);
    expect(result.spec.layers).toHaveLength(4);
    expect(result.averageConfidence).toBeCloseTo(0.8);
    expect(result.receipts).toHaveLength(2);
    expect(result.receipts[0].stage).toBe("thesis");
    expect(result.receipts[1].stage).toBe("composition");
  });

  it("uses the same deterministic seed for the same prompt", async () => {
    const decideFn = async ({ questions }) => ({ ...fakeResult(questions), response: {} });
    const first = await composeArtWithJev({ prompt: "same image" }, { decideFn, model: {} });
    const second = await composeArtWithJev({ prompt: "same image" }, { decideFn, model: {} });
    expect(first.spec.seed).toBe(second.spec.seed);
  });
});
