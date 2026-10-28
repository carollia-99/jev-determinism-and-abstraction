export const IMAGE_MODELS = Object.freeze([
  { id: "openai/gpt-image-2.5-flare", label: "GPT Image 2.5 Flare", family: "OpenAI" },
  { id: "recraft/recraft-v4.1-flash", label: "Recraft V4.1 Flash", family: "Recraft" },
  { id: "bfl/flux-3-image", label: "FLUX 3 Image", family: "Black Forest Labs" },
  { id: "meta/muse-image-1.0", label: "Muse Image 1.0", family: "Meta" },
]);

export const DEFAULT_IMAGE_MODEL = "openai/gpt-image-2.5-flare";

export function imageModelLabel(modelId) {
  return IMAGE_MODELS.find((model) => model.id === modelId)?.label ?? modelId;
}

export function isImageModel(modelId) {
  return IMAGE_MODELS.some((model) => model.id === modelId);
}
