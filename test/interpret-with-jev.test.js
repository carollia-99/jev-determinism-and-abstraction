import { describe, expect, it } from "vitest";
import { interpretWithJev, validateInterpretRequest } from "../server/interpret-with-jev.js";

const currentState = { motion: "DRIFT", speed: "MEDIUM", energy: "MEDIUM" };

describe("Jev interpretation service", () => {
  it("validates bounded request input", () => {
    expect(validateInterpretRequest({ prompt: "  Sunday morning  ", currentState })).toEqual({
      prompt: "Sunday morning",
      currentState,
      capabilities: [],
      allowedMotions: ["DRIFT", "JITTER", "ORBIT", "REPEL"],
    });
    expect(() => validateInterpretRequest({ prompt: "", currentState })).toThrow("Prompt is required");
    expect(() =>
      validateInterpretRequest({ prompt: "calm", currentState: { ...currentState, motion: "SWARM" } }),
    ).toThrow("Current artwork state is invalid");
  });

  it("returns only the bounded Jev decisions", async () => {
    const decideFn = async ({ state, questions }) => {
      expect(state.userPrompt).toBe("three espressos");
      expect(Object.keys(questions)).toEqual(["capabilitySufficient", "motion", "speed", "energy"]);
      return {
        answers: {
          capabilitySufficient: { probability: 0.96 },
          motion: { choice: "JITTER", probabilities: { JITTER: 0.92 } },
          speed: { choice: "HIGH", probabilities: { HIGH: 0.88 } },
          energy: { choice: "HIGH", probabilities: { HIGH: 0.95 } },
        },
        usage: { inputTokens: 80, outputTokens: 12, totalTokens: 92 },
        providerMetadata: { gateway: { cost: 0.000014 } },
        response: { modelId: "typesafe-ai/jev-1.14.0" },
      };
    };

    const result = await interpretWithJev(
      { prompt: "three espressos", currentState },
      { decideFn, model: {}, modelId: "test-jev" },
    );

    expect(result.state).toEqual({ motion: "JITTER", speed: "HIGH", energy: "HIGH" });
    expect(result.decisions.motion).toEqual({ choice: "JITTER", confidence: 0.92 });
    expect(result.capability).toMatchObject({
      sufficient: true,
      action: "reuse_existing",
      confidence: 0.96,
    });
    expect(result.source).toBe("jev");
    expect(result.receipt).toMatchObject({
      stage: "decision",
      tokens: { input: 80, output: 12, total: 92 },
      costUsd: 0.000014,
    });
  });

  it("preserves the current state when a new capability is required", async () => {
    const decideFn = async () => ({
      answers: {
        capabilitySufficient: { probability: 0.08 },
        motion: { choice: "ORBIT", probabilities: { ORBIT: 0.51 } },
        speed: { choice: "HIGH", probabilities: { HIGH: 0.72 } },
        energy: { choice: "HIGH", probabilities: { HIGH: 0.8 } },
      },
      response: { modelId: "test-jev" },
    });

    const result = await interpretWithJev(
      { prompt: "move like a school of fish", currentState },
      { decideFn, model: {}, capabilityThreshold: 0.6 },
    );

    expect(result.state).toEqual(currentState);
    expect(result.proposedState).toEqual({ motion: "ORBIT", speed: "HIGH", energy: "HIGH" });
    expect(result.capability).toMatchObject({
      sufficient: false,
      action: "generate_new",
      confidence: 0.92,
    });
  });

  it("lets Jev reuse a learned session capability without generation", async () => {
    const capabilities = [
      { name: "JELLYFISH", description: "Pulsing upward movement with a soft lateral sway." },
    ];
    const decideFn = async ({ state, questions }) => {
      expect(state.availableMotionPrimitives).toContain("JELLYFISH");
      expect(questions.motion.criteria.JELLYFISH).toContain("Session capability");
      return {
        answers: {
          capabilitySufficient: { probability: 0.97 },
          motion: { choice: "JELLYFISH", probabilities: { JELLYFISH: 0.99 } },
          speed: { choice: "LOW", probabilities: { LOW: 0.93 } },
          energy: { choice: "LOW", probabilities: { LOW: 0.91 } },
        },
        response: { modelId: "test-jev" },
      };
    };

    const result = await interpretWithJev(
      {
        prompt: "make the jellyfish slower and calmer",
        currentState: { motion: "JELLYFISH", speed: "HIGH", energy: "HIGH" },
        capabilities,
      },
      { decideFn, model: {} },
    );

    expect(result.state).toEqual({ motion: "JELLYFISH", speed: "LOW", energy: "LOW" });
    expect(result.capability.action).toBe("reuse_session");
  });

  it("rejects an unsupported decision before it reaches the renderer", async () => {
    const decideFn = async () => ({
      answers: {
        capabilitySufficient: { probability: 0.9 },
        motion: { choice: "SWARM" },
        speed: { choice: "HIGH" },
        energy: { choice: "HIGH" },
      },
      response: { modelId: "test-jev" },
    });

    await expect(
      interpretWithJev({ prompt: "school of fish", currentState }, { decideFn, model: {} }),
    ).rejects.toThrow("unsupported artwork state");
  });
});
