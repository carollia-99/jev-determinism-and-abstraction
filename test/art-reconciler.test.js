import { describe, expect, it } from "vitest";
import { buildRelevantArtQuestions, extractExplicitColors, reconcileArtSpec } from "../server/art-reconciler.js";
import { buildArtQuestions } from "../shared/art-grammar.js";

function choiceAnswers() {
  return Object.fromEntries(Object.entries(buildArtQuestions()).map(([key, question]) => {
    const choice = Object.keys(question.criteria)[0];
    return [key, { type: "choice", choice, probabilities: { [choice]: 0.8 } }];
  }));
}

describe("art reconciliation", () => {
  it("does not ask layer questions for a pure gradient thesis", () => {
    const questions = buildRelevantArtQuestions({ fieldIntent: "GRADIENT", relevance: { palette: 3, motion: 0, texture: 0, symmetry: 0 } });
    expect(Object.keys(questions).some((key) => key.startsWith("layer"))).toBe(false);
    expect(questions.motion).toBeUndefined();
    expect(questions.texture).toBeUndefined();
  });

  it("uses relevance scores to omit low-value detail families", () => {
    const questions = buildRelevantArtQuestions({
      fieldIntent: "MARKS",
      relevance: { palette: 3, composition: 3, marks: 3, space: 0, motion: 0, texture: 0, symmetry: 0, atmosphere: 0, disorder: 3 },
    });
    expect(questions.primaryColor).toBeDefined();
    expect(questions.turbulence).toBeDefined();
    expect(questions.negativeSpace).toBeUndefined();
    expect(questions.motion).toBeUndefined();
    expect(questions.texture).toBeUndefined();
    expect(questions.layer1_noise).toBeDefined();
    expect(questions.layer1_blendMode).toBeUndefined();
  });

  it("omits detailed layer construction when mark-making has low relevance", () => {
    const questions = buildRelevantArtQuestions({
      fieldIntent: "MARKS",
      relevance: { palette: 3, composition: 0, marks: 0, space: 0, motion: 0, texture: 0, symmetry: 0, atmosphere: 0, disorder: 0 },
    });
    expect(questions.layer1_primitive).toBeUndefined();
    expect(questions.layer1_density).toBeUndefined();
    expect(questions.layer1_colorRole).toBeDefined();
  });

  it("extracts literal colors in mention order without duplicates", () => {
    expect(extractExplicitColors("white pink orange pink gradient")).toEqual(["WHITE", "PINK", "ORANGE"]);
  });

  it("preserves and visibly assigns every requested three-color mark palette", () => {
    const answers = choiceAnswers();
    answers.background.choice = "RED";
    answers.primaryColor.choice = "RED";
    answers.secondaryColor.choice = "GREEN";
    answers.accentColor.choice = "RED";
    ["PRIMARY", "PRIMARY", "ACCENT", "ACCENT"].forEach((role, index) => {
      answers[`layer${index + 1}_colorRole`] = { type: "choice", choice: role, probabilities: { [role]: 0.8 } };
    });
    const result = reconcileArtSpec({
      prompt: "chaos red green white",
      thesis: { fieldIntent: "MARKS", useMotion: false, useTexture: false, useSymmetry: false },
      answers,
      seed: 2,
    });
    expect(result.spec.requestedColors).toEqual(["RED", "GREEN", "WHITE"]);
    expect([result.spec.primaryColor, result.spec.secondaryColor, result.spec.accentColor]).toEqual(["RED", "GREEN", "WHITE"]);
    expect(new Set(result.spec.layers.map((layer) => layer.colorRole))).toEqual(new Set(["PRIMARY", "SECONDARY", "ACCENT"]));
  });

  it.each([
    ["early morning sun", "YELLOW"],
    ["grass moving", "GREEN"],
    ["water", "BLUE"],
  ])("turns the Jev dominant-color anchor into canvas coverage for %s", (prompt, dominantColor) => {
    const answers = choiceAnswers();
    const result = reconcileArtSpec({
      prompt,
      thesis: {
        fieldIntent: "MARKS",
        dominantColor,
        colorCoverage: 1.8,
        formIntent: "ORGANIC",
        useMotion: false,
        useTexture: false,
        useSymmetry: false,
      },
      answers,
      seed: 3,
    });
    expect(result.spec.fieldTreatment).toBe("GRADIENT_AND_MARKS");
    expect(result.spec.gradientStartColor).toBe(dominantColor);
    expect(result.spec.primaryColor).toBe(dominantColor);
  });

  it("constrains explicit geometric form intent to geometric primitives", () => {
    const answers = choiceAnswers();
    const result = reconcileArtSpec({
      prompt: "Quiet geometry floating in a field of warm light",
      thesis: {
        fieldIntent: "GRADIENT_AND_MARKS",
        dominantColor: "ORANGE",
        colorCoverage: 1.4,
        formIntent: "GEOMETRIC",
        useMotion: false,
        useTexture: false,
        useSymmetry: false,
      },
      answers,
      seed: 4,
    });
    expect(result.spec.shapeLanguage).toBe("GEOMETRIC");
    expect(result.spec.layers.every((layer) => ["POLYGON", "CIRCLE", "ARC"].includes(layer.primitive))).toBe(true);
  });

  it("derives palette variety and repairs invisible light-field blending", () => {
    const answers = choiceAnswers();
    answers.background.choice = "WHITE";
    answers.primaryColor.choice = "YELLOW";
    answers.secondaryColor.choice = "YELLOW";
    answers.accentColor.choice = "YELLOW";
    for (let index = 1; index <= 4; index += 1) {
      answers[`layer${index}_blendMode`] = { type: "choice", choice: "SCREEN", probabilities: { SCREEN: 0.8, NORMAL: 0.2 } };
    }
    const result = reconcileArtSpec({
      prompt: "sunny day",
      thesis: { fieldIntent: "MARKS", useMotion: false, useTexture: false, useSymmetry: false },
      answers,
      seed: 1,
    });
    expect([result.spec.primaryColor, result.spec.secondaryColor, result.spec.accentColor]).toEqual(["YELLOW", "ORANGE", "CREAM"]);
    expect(result.spec.layers.every((layer) => layer.blendMode === "MULTIPLY")).toBe(true);
    expect(result.repairs.length).toBeGreaterThan(1);
  });
});
