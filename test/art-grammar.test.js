import { describe, expect, it } from "vitest";
import { ART_DECISION_COUNT, artSpecFromAnswers, buildArtQuestions, buildArtSpecJsonSchema, createDefaultArtSpec } from "../shared/art-grammar.js";

function firstChoiceAnswers() {
  return Object.fromEntries(Object.entries(buildArtQuestions()).map(([key, question]) => {
    const choice = Object.keys(question.criteria)[0];
    return [key, { choice, probabilities: { [choice]: 0.8 } }];
  }));
}

describe("art grammar", () => {
  it("defines 80 typed decisions across four layers", () => {
    expect(Object.keys(buildArtQuestions())).toHaveLength(ART_DECISION_COUNT);
    expect(ART_DECISION_COUNT).toBe(80);
    expect(createDefaultArtSpec().layers).toHaveLength(4);
  });

  it("converts model answers into a seeded renderer specification", () => {
    const spec = artSpecFromAnswers(firstChoiceAnswers(), 42);
    expect(spec.seed).toBe(42);
    expect(spec.layers).toHaveLength(4);
    expect(spec.composition).toBe("RADIAL");
    expect(spec.gradientStartColor).toBe("RED");
    expect(spec.gradientEndColor).toBe("RED");
    expect(spec.layers[0].primitive).toBe("DOT");
  });

  it("exposes the same grammar as one complete structured-output schema", () => {
    const schema = buildArtSpecJsonSchema();
    expect(schema.required).toContain("composition");
    expect(schema.required).toContain("layers");
    expect(schema.properties.layers.minItems).toBe(4);
    expect(schema.properties.layers.items.required).toHaveLength(13);
    expect(schema.properties.composition.enum).toContain("RADIAL");
  });
});
