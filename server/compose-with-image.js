import { generateImage } from "ai";
import {
  DEFAULT_IMAGE_MODEL,
  isImageModel,
} from "../shared/image-models.js";
import { createAIReceipt } from "./ai-receipt.js";
import { validateComposeRequest } from "./compose-with-jev.js";

export async function composeArtWithImage(body, options = {}) {
  const { prompt } = validateComposeRequest(body);
  const generateImageFn = options.generateImageFn ?? generateImage;
  const requestedModel = typeof body.model === "string" ? body.model.trim() : "";
  if (requestedModel && !isImageModel(requestedModel)) {
    throw new TypeError("The selected image model is not supported.");
  }

  const modelId = options.modelId ?? (requestedModel || process.env.IMAGE_MODEL || DEFAULT_IMAGE_MODEL);
  const startedAt = performance.now();
  const emit = options.onProgress ?? (() => {});
  emit({
    stage: "image-generation",
    status: "running",
    label: "Generating image",
    message: "The selected image model is rendering the prompt directly…",
    detail: modelId,
  });

  const result = await generateImageFn({
    model: options.model ?? modelId,
    prompt,
    n: 1,
  });
  const image = result.image ?? result.images?.[0];
  if (!image?.base64 || !image?.mediaType) {
    throw new TypeError("The image model returned no usable image.");
  }

  const latencyMs = Math.round(performance.now() - startedAt);
  const resolvedModel = result.responses?.at(-1)?.modelId ?? result.calls?.at(-1)?.response?.modelId ?? modelId;
  const receipt = createAIReceipt(result, {
    model: resolvedModel,
    latencyMs,
    stage: "image-generation",
  });
  emit({
    stage: "image-generation",
    status: "complete",
    label: "Image ready",
    message: "The generated image is ready to view and download.",
    detail: `${resolvedModel} · ${latencyMs} ms`,
  });

  return {
    source: "image-generation",
    mode: "image",
    model: resolvedModel,
    latencyMs,
    image: {
      dataUrl: `data:${image.mediaType};base64,${image.base64}`,
      mediaType: image.mediaType,
    },
    trace: {
      mode: "image-generation",
      imagesGenerated: result.usage?.imagesGenerated ?? 1,
      warnings: (result.warnings ?? []).map((warning) => warning.message ?? String(warning)),
    },
    receipt,
    receipts: [receipt],
  };
}
