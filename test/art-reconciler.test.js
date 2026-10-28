import { describe, expect, it } from "vitest";
import { buildRelevantArtQuestions, reconcileArtSpec } from "../server/art-reconciler.js";
import { buildArtQuestions } from "../shared/art-grammar.js";

function choiceAnswers() {
  return Object.fromEntries(Object.entries(buildArtQuestions()).map(([key, question]) => {
    const choice = Object.keys(question.criteria)[0];
    return [key, { type: "choice", choice, probabilities: { [choice]: 0.8 } }];
  }));
}

describe("art reconciliation", () => {
  it("does not ask layer questions for a pure gradient thesis", () => {
    const questions = buildRelevantArtQuestions({ fieldIntent: "GRADIENT", useMotion: false, useTexture: false, useSymmetry: false });
    expect(Object.keys(questions).some((key) => key.startsWith("layer"))).toBe(false);
    expect(questions.motion).toBeUndefined();
    expect(questions.texture).toBeUndefined();
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
