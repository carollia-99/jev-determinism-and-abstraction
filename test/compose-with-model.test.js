import { describe, expect, it, vi } from "vitest";
import { createDefaultArtSpec, seedFromPrompt } from "../shared/art-grammar.js";
import { composeArtWithModel } from "../server/compose-with-model.js";

function generatedSpec(overrides = {}) {
  const { seed: _seed, ...spec } = createDefaultArtSpec();
  return { ...spec, ...overrides, layers: spec.layers.map((layer) => ({ ...layer })) };
}

describe("full-model art composition", () => {
  it("generates one complete ArtSpec and records one Gateway receipt", async () => {
    const generateTextFn = vi.fn().mockResolvedValue({
      output: generatedSpec({ composition: "RADIAL" }),
      usage: { inputTokens: 920, outputTokens: 640, totalTokens: 1560 },
      providerMetadata: { gateway: { cost: "0.0042" } },
      response: { modelId: "test/general-model" },
    });

    const result = await composeArtWithModel(
      { prompt: "quiet geometry" },
      { generateTextFn, modelId: "test/general-model" },
    );

    expect(generateTextFn).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      source: "model-art",
      mode: "model",
      model: "test/general-model",
      decisionCount: 80,
      appliedDecisionCount: 80,
      averageConfidence: null,
    });
    expect(result.spec.composition).toBe("RADIAL");
    expect(result.spec.seed).toBe(seedFromPrompt("quiet geometry"));
    expect(result.receipts).toEqual([
      expect.objectContaining({ stage: "model-composition", costUsd: 0.0042, tokens: { input: 920, output: 640, total: 1560 } }),
    ]);
  });

  it("uses the shared literal-color and visibility repair pass", async () => {
    const spec = generatedSpec({
      background: "WHITE",
      fieldTreatment: "GRADIENT_AND_MARKS",
      gradientStartColor: "BLUE",
      gradientEndColor: "CYAN",
      layers: createDefaultArtSpec().layers.map((layer) => ({ ...layer, blendMode: "SCREEN" })),
    });
    const result = await composeArtWithModel(
      { prompt: "red yellow gradient" },
      { generateTextFn: vi.fn().mockResolvedValue({ output: spec }), modelId: "test/general-model" },
    );

    expect(result.spec.gradientStartColor).toBe("RED");
    expect(result.spec.gradientEndColor).toBe("YELLOW");
    expect(result.spec.layers.every((layer) => layer.blendMode === "MULTIPLY")).toBe(true);
    expect(result.repairs.length).toBeGreaterThan(1);
  });

  it("uses a supported UI-selected Gateway model", async () => {
    const generateTextFn = vi.fn().mockResolvedValue({
      output: generatedSpec(),
      response: { modelId: "openai/gpt-5.4-mini" },
    });

    const result = await composeArtWithModel(
      { prompt: "green blue gradient", model: "openai/gpt-5.4-mini" },
      { generateTextFn },
    );

    expect(generateTextFn.mock.calls[0][0].model).toBe("openai/gpt-5.4-mini");
    expect(result.model).toBe("openai/gpt-5.4-mini");
  });

  it("rejects unsupported model identifiers", async () => {
    await expect(
      composeArtWithModel(
        { prompt: "test", model: "untrusted/provider-model" },
        { generateTextFn: vi.fn() },
      ),
    ).rejects.toThrow("selected comparison model is not supported");
  });
});

