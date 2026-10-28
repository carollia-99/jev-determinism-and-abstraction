import { describe, expect, it, vi } from "vitest";
import { composeArtWithImage } from "../server/compose-with-image.js";

describe("image generation composition", () => {
  it("generates one image and returns a restorable data URL", async () => {
    const generateImageFn = vi.fn().mockResolvedValue({
      image: { base64: "aGVsbG8=", mediaType: "image/png" },
      images: [{ base64: "aGVsbG8=", mediaType: "image/png" }],
      usage: { imagesGenerated: 1 },
      providerMetadata: { gateway: { cost: "0.02" } },
      responses: [{ modelId: "bfl/flux-3-image" }],
      warnings: [],
    });

    const result = await composeArtWithImage(
      { prompt: "cyan light over yellow dunes", model: "bfl/flux-3-image" },
      { generateImageFn },
    );

    expect(generateImageFn).toHaveBeenCalledWith({
      model: "bfl/flux-3-image",
      prompt: "cyan light over yellow dunes",
      n: 1,
    });
    expect(result).toMatchObject({
      source: "image-generation",
      mode: "image",
      model: "bfl/flux-3-image",
      image: { dataUrl: "data:image/png;base64,aGVsbG8=", mediaType: "image/png" },
      trace: { imagesGenerated: 1 },
    });
    expect(result.receipts[0]).toMatchObject({ stage: "image-generation", costUsd: 0.02 });
  });

  it("rejects unsupported image model identifiers", async () => {
    await expect(composeArtWithImage(
      { prompt: "test", model: "untrusted/image-model" },
      { generateImageFn: vi.fn() },
    )).rejects.toThrow("selected image model is not supported");
  });
});
