import { describe, expect, it } from "vitest";
import { interpretPrompt } from "../src/interpreter.js";

describe("local prompt interpreter", () => {
  it.each([
    ["I feel anxious and frantic", { motion: "JITTER", speed: "HIGH", energy: "HIGH" }],
    ["Make it calm and peaceful", { motion: "DRIFT", speed: "LOW", energy: "LOW" }],
    ["Something energetic", { motion: "ORBIT", speed: "HIGH", energy: "HIGH" }],
    ["Scatter everything", { motion: "REPEL", speed: "MEDIUM", energy: "HIGH" }],
    ["Dreamy floating motion", { motion: "DRIFT", speed: "LOW", energy: "MEDIUM" }],
  ])("maps %s deterministically", (prompt, expected) => {
    expect(interpretPrompt(prompt)).toEqual(expected);
    expect(interpretPrompt(prompt)).toEqual(expected);
  });

  it("normalizes case and whitespace", () => {
    expect(interpretPrompt("  ENERGETIC  ")).toEqual({ motion: "ORBIT", speed: "HIGH", energy: "HIGH" });
  });

  it("returns null for empty and unknown prompts", () => {
    expect(interpretPrompt("   ")).toBeNull();
    expect(interpretPrompt("make it interesting")).toBeNull();
  });
});
