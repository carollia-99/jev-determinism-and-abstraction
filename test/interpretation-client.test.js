import { describe, expect, it, vi } from "vitest";
import { requestCapabilityProposal, requestJevInterpretation } from "../src/interpretation-client.js";

const currentState = { motion: "DRIFT", speed: "MEDIUM", energy: "MEDIUM" };

describe("Jev interpretation client", () => {
  it("posts the prompt and current semantic state", async () => {
    const result = { state: { motion: "ORBIT", speed: "HIGH", energy: "HIGH" }, latencyMs: 42 };
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => result });

    await expect(requestJevInterpretation("energetic", currentState, fetchFn)).resolves.toEqual(result);
    expect(fetchFn).toHaveBeenCalledWith("/api/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "energetic", currentState, capabilities: [] }),
    });
  });

  it("preserves the server error code for fallback handling", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Authentication missing", code: "MISSING_AI_GATEWAY_AUTH" }),
    });

    await expect(requestJevInterpretation("Sunday morning", currentState, fetchFn)).rejects.toMatchObject({
      message: "Authentication missing",
      code: "MISSING_AI_GATEWAY_AUTH",
    });
  });

  it("requests a separate quarantined capability proposal", async () => {
    const proposedState = { motion: "ORBIT", speed: "HIGH", energy: "HIGH" };
    const result = { proposal: { name: "FLOCK", status: "quarantined" }, executed: false };
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => result });

    await expect(
      requestCapabilityProposal("move like a school of fish", currentState, proposedState, fetchFn),
    ).resolves.toEqual(result);
    expect(fetchFn).toHaveBeenCalledWith("/api/generate-capability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "move like a school of fish",
        currentState,
        proposedState,
        capabilities: [],
      }),
    });
  });
});
