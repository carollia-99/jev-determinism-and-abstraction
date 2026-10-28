import { describe, expect, it } from "vitest";
import { createParticles, createSeededRandom, stepParticles } from "../src/particles.js";

const frame = { width: 100, height: 100, time: 1, deltaScale: 1 };
const baseState = { speed: "MEDIUM", energy: "MEDIUM" };

describe("particle engine", () => {
  it("creates persistent position and velocity state", () => {
    const particles = createParticles(300, 100, 100, () => 0.5);
    expect(particles).toHaveLength(300);
    expect(particles[0]).toMatchObject({ id: 0, x: 50, y: 50 });
    expect(particles[0]).toHaveProperty("vx");
    expect(particles[0]).toHaveProperty("vy");
  });

  it("reproduces the same field from the same seed", () => {
    const first = createParticles(3, 100, 100, createSeededRandom(42));
    const second = createParticles(3, 100, 100, createSeededRandom(42));
    expect(first).toEqual(second);
  });

  it("keeps particle objects when switching modes", () => {
    const particles = createParticles(4, 100, 100, () => 0.35);
    const identities = [...particles];
    stepParticles(particles, { ...baseState, motion: "DRIFT" }, frame);
    stepParticles(particles, { ...baseState, motion: "ORBIT" }, frame);
    identities.forEach((particle, index) => expect(particles[index]).toBe(particle));
  });

  it("wraps particles across the canvas edges", () => {
    const particles = [{ id: 0, x: 99.9, y: 50, vx: 2, vy: 0, size: 1, phase: 0 }];
    stepParticles(particles, { ...baseState, motion: "DRIFT" }, frame);
    expect(particles[0].x).toBeGreaterThanOrEqual(0);
    expect(particles[0].x).toBeLessThan(100);
  });

  it("applies a distinct force for every motion mode", () => {
    const velocities = ["DRIFT", "JITTER", "ORBIT", "REPEL"].map((motion) => {
      const particles = [{ id: 7, x: 72, y: 34, vx: 0.2, vy: -0.1, size: 1, phase: 0.8 }];
      stepParticles(particles, { ...baseState, motion }, frame);
      return `${particles[0].vx.toFixed(5)},${particles[0].vy.toFixed(5)}`;
    });
    expect(new Set(velocities).size).toBe(4);
  });
});
