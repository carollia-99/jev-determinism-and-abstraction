import { describe, expect, it, vi } from "vitest";
import { routePromptWithJev } from "../server/route-with-jev.js";

function routeResult(choice, confidence) {
  return {
    answers: {
      compositionRoute: {
        type: "choice",
        choice,
        probabilities: {
          [choice]: confidence,
          [choice === "CUSTOM_CODE" ? "POPULATE_SPEC" : "CUSTOM_CODE"]: 1 - confidence,
        },
      },
      routeReason: {
        type: "choice",
        choice: choice === "CUSTOM_CODE" ? "INTERACTION" : "SPEC_IS_ENOUGH",
        probabilities: { [choice === "CUSTOM_CODE" ? "INTERACTION" : "SPEC_IS_ENOUGH"]: 0.9 },
      },
    },
    response: { modelId: "typesafe-ai/jev-test" },
    usage: { inputTokens: 20, outputTokens: 4, totalTokens: 24 },
    providerMetadata: { gateway: { cost: "0.00001" } },
  };
}

describe("Jev composition routing", () => {
  it("routes a high-confidence out-of-grammar prompt to custom code", async () => {
    const decideFn = vi.fn(async () => routeResult("CUSTOM_CODE", 0.82));
    const result = await routePromptWithJev(
      { prompt: "draw a subway map whose station labels orbit the cursor" },
      { decideFn, model: {} },
    );

    expect(result).toMatchObject({
      route: "CUSTOM_CODE",
      requestedRoute: "CUSTOM_CODE",
      confidence: 0.82,
      reason: "The prompt depends on viewer interaction, which requires custom JavaScript.",
    });
    expect(result.receipt).toMatchObject({ stage: "composition-route", tokens: { total: 24 }, costUsd: 0.00001 });
  });

  it("keeps the fixed spec when a custom-code choice is uncertain", async () => {
    const decideFn = vi.fn(async () => routeResult("CUSTOM_CODE", 0.51));
    const result = await routePromptWithJev(
      { prompt: "quiet geometry in warm light" },
      { decideFn, model: {} },
    );

    expect(result).toMatchObject({
      route: "POPULATE_SPEC",
      requestedRoute: "CUSTOM_CODE",
      confidence: 0.51,
      threshold: 0.65,
    });
  });
});
