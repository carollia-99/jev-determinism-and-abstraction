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
    expect(Object.keys(decideFn.mock.calls[0][0].questions)).toHaveLength(17);
    expect(Object.keys(decideFn.mock.calls[1][0].questions).length).toBeLessThan(80);
    expect(result.decisionCount).toBeLessThan(MAX_ART_DECISION_COUNT);
    expect(result.skippedDecisionCount).toBeGreaterThan(0);
    expect(result.spec.layers).toHaveLength(4);
    expect(result.averageConfidence).toBeCloseTo(0.8);
    expect(result.receipts).toHaveLength(2);
    expect(result.receipts[0].stage).toBe("thesis");
    expect(result.receipts[1].stage).toBe("composition");
    expect(result.trace.tier1.decisions).toHaveLength(17);
    expect(result.trace.tier2.decisions).toHaveLength(Object.keys(decideFn.mock.calls[1][0].questions).length);
    expect(result.trace.routing.threshold).toBe(1.5);
    expect(result.trace.routing.askedQuestionIds.length).toBe(result.trace.tier2.decisions.length);
    expect(result.trace.compile.overrides).toContain("fieldTreatment ← Tier 1 GRADIENT");
    expect(result.trace.compile.provenance.length).toBeGreaterThan(80);
    expect(result.trace.compile.provenance).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "fieldTreatment", source: "tier1" }),
      expect.objectContaining({ path: "seed", source: "prompt-seed" }),
    ]));
  });

  it("clarifies low-confidence core thesis decisions before routing details", async () => {
    let call = 0;
    const decideFn = vi.fn(async ({ questions }) => {
      const response = fakeResult(questions);
      if (call++ === 0) {
        for (const id of ["fieldIntent", "dominantColor", "formIntent"]) {
          const answer = response.answers[id];
          answer.probabilities = { [answer.choice]: 0.4, OTHER: 0.35 };
        }
        response.answers.colorCoverage.probabilities = { 0: 0.3, 1: 0.4, 2: 0.3 };
      }
      return response;
    });
    const result = await composeArtWithJev({ prompt: "ambiguous atmosphere" }, { decideFn, model: {} });
    expect(decideFn).toHaveBeenCalledTimes(3);
    expect(Object.keys(decideFn.mock.calls[1][0].questions)).toEqual(["fieldIntent", "dominantColor", "colorCoverage", "formIntent"]);
    expect(result.receipts.map((receipt) => receipt.stage)).toEqual(["thesis", "thesis-refinement", "composition"]);
    expect(result.trace.tier1.refinement.acceptedQuestionIds).toHaveLength(4);
  });

  it("surfaces literal constraints and sanitized decision probabilities", async () => {
    const decideFn = vi.fn(async ({ questions }) => fakeResult(questions));
    const result = await composeArtWithJev({ prompt: "chaos red green white" }, { decideFn, model: {} });
    expect(result.trace.constraints.colors).toEqual(["RED", "GREEN", "WHITE"]);
    expect(result.trace.tier1.decisions[0]).toMatchObject({
      id: "fieldIntent",
      type: "choice",
      selected: "GRADIENT",
      confidence: 0.8,
    });
    expect(result.trace.tier1.decisions[0].probabilities).toEqual({ GRADIENT: 0.8 });
  });

  it("uses the same deterministic seed for the same prompt", async () => {
    const decideFn = async ({ questions }) => ({ ...fakeResult(questions), response: {} });
    const first = await composeArtWithJev({ prompt: "same image" }, { decideFn, model: {} });
    const second = await composeArtWithJev({ prompt: "same image" }, { decideFn, model: {} });
    expect(first.spec.seed).toBe(second.spec.seed);
  });
});
