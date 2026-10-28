import { beforeEach, describe, expect, it, vi } from "vitest";
import { getArtState, subscribeToArtState, updateArtState } from "../src/art-state.js";
import { clearSessionCapabilities, registerSessionCapability } from "../src/capability-registry.js";

const sessionCode = `export function applyMotion(particle, context) {
  particle.vx += Math.sin(context.time + particle.phase) * 0.01;
  particle.vy -= Math.cos(context.time + particle.phase) * 0.01;
}`;

describe("artwork state", () => {
  beforeEach(() => {
    clearSessionCapabilities();
    updateArtState({ motion: "DRIFT", speed: "MEDIUM", energy: "MEDIUM" });
  });

  it("accepts a motion only after it joins the session registry", () => {
    expect(() => updateArtState({ motion: "JELLYFISH" })).toThrow("Unknown motion");
    registerSessionCapability({
      name: "JELLYFISH",
      description: "Particles pulse upward while swaying gently from side to side.",
      code: sessionCode,
      contract: "motion-v1",
    });
    expect(updateArtState({ motion: "JELLYFISH" }).motion).toBe("JELLYFISH");
  });

  it("updates state only through the public update function", () => {
    const original = getArtState();
    expect(Object.isFrozen(original)).toBe(true);
    updateArtState({ motion: "ORBIT" });
    expect(getArtState()).toEqual({ motion: "ORBIT", speed: "MEDIUM", energy: "MEDIUM" });
    expect(getArtState()).not.toBe(original);
  });

  it("notifies subscribers and rejects invalid values", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToArtState(listener);
    updateArtState({ motion: "REPEL" });
    expect(listener).toHaveBeenCalledWith({ motion: "REPEL", speed: "MEDIUM", energy: "MEDIUM" });
    expect(() => updateArtState({ motion: "SWARM" })).toThrow("Unknown motion");
    unsubscribe();
  });
});
