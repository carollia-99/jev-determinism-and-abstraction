import { describe, expect, it, vi } from "vitest";
import {
  generateCapabilityProposal,
  motionCapabilityContract,
  validateCapabilityRequest,
} from "../server/generate-capability.js";

const currentState = { motion: "DRIFT", speed: "LOW", energy: "LOW" };
const proposedState = { motion: "ORBIT", speed: "HIGH", energy: "HIGH" };
const request = { prompt: "move like a school of fish", currentState, proposedState };
const validCode = `export function applyMotion(particle, context) {
  const dx = context.width * 0.5 - particle.x;
  const dy = context.height * 0.5 - particle.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  particle.vx += (dx / distance) * 0.01 * context.energy;
  particle.vy += (dy / distance) * 0.01 * context.energy;
}`;

describe("capability generation service", () => {
  it("validates the bounded context sent after Jev escalation", () => {
    expect(validateCapabilityRequest({ ...request, prompt: "  move like a school of fish  " })).toEqual(
      { ...request, capabilities: [] },
    );
    expect(() => validateCapabilityRequest({ ...request, proposedState: { ...proposedState, motion: "FLOCK" } })).toThrow(
      "Current artwork state is invalid",
    );
  });

  it("returns a structured, quarantined, unexecuted proposal", async () => {
    const generateTextFn = vi.fn().mockResolvedValue({
      output: {
        name: "FLOCK",
        description: "Particles steer toward a shared center to suggest coordinated schooling.",
        code: validCode,
      },
      usage: { inputTokens: 220, outputTokens: 180, totalTokens: 400 },
      providerMetadata: { gateway: { cost: 0.0024 } },
      response: { modelId: "anthropic/claude-sonnet-4.6" },
    });

    const result = await generateCapabilityProposal(request, {
      generateTextFn,
      modelId: "test-capability-model",
    });

    expect(generateTextFn).toHaveBeenCalledOnce();
    expect(generateTextFn.mock.calls[0][0]).toMatchObject({ model: "test-capability-model" });
    expect(result).toMatchObject({
      proposal: { name: "FLOCK", status: "quarantined", contract: "motion-v1", code: validCode },
      source: "capability-model",
      model: "anthropic/claude-sonnet-4.6",
      executed: false,
    });
    expect(result.receipt).toMatchObject({
      stage: "generation",
      tokens: { total: 400 },
      costUsd: 0.0024,
    });
    expect(motionCapabilityContract.mutation).toContain("vx");
  });

  it("rejects code that escapes the motion-v1 contract", async () => {
    const generateTextFn = vi.fn().mockResolvedValue({
      output: {
        name: "REMOTE_SWARM",
        description: "Particles fetch remote coordinates before steering toward the response.",
        code: `export function applyMotion(particle, context) {
          fetch("https://example.com");
          particle.vx += context.energy;
          particle.vy += context.energy;
        }`,
      },
    });

    await expect(generateCapabilityProposal(request, { generateTextFn, model: {} })).rejects.toThrow(
      "outside the motion-v1 contract",
    );
  });
});
