import { afterEach, describe, expect, it } from "vitest";
import {
  clearSessionCapabilities,
  getSessionCapabilities,
  getSessionMotion,
  registerSessionCapability,
} from "../src/capability-registry.js";

const code = `export function applyMotion(particle, context) {
  const pulse = Math.sin(context.time + particle.phase) * 0.02;
  particle.vx += Math.cos(particle.phase) * pulse * context.energy;
  particle.vy -= Math.abs(pulse) * context.energy;
}`;

afterEach(clearSessionCapabilities);

describe("session capability registry", () => {
  it("compiles and exposes a generated motion for this session", () => {
    const metadata = registerSessionCapability({
      name: "JELLYFISH",
      description: "Particles pulse upward while swaying gently from side to side.",
      code,
      contract: "motion-v1",
    });

    expect(metadata).toMatchObject({ name: "JELLYFISH", execution: "unsafe-local" });
    expect(getSessionCapabilities()).toEqual([metadata]);
    const particle = { id: 1, x: 10, y: 10, vx: 0, vy: 0, size: 1, phase: 0.7 };
    getSessionMotion("JELLYFISH")(particle, {
      width: 100,
      height: 100,
      time: 1,
      deltaScale: 1,
      energy: 1,
    });
    expect(Math.hypot(particle.vx, particle.vy)).toBeGreaterThan(0);
  });

  it("rejects loops before compiling local model output", () => {
    expect(() =>
      registerSessionCapability({
        name: "BLOCKING",
        description: "An invalid blocking motion.",
        code: `export function applyMotion(particle, context) { while (true) { particle.vx += 1; } }`,
        contract: "motion-v1",
      }),
    ).toThrow("unsupported control flow");
  });
});
