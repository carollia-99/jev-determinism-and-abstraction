export const COMPARISON_MODELS = Object.freeze([
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", family: "Anthropic" },
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", family: "Anthropic" },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini", family: "OpenAI" },
  { id: "openai/gpt-5.4", label: "GPT-5.4", family: "OpenAI" },
]);

export const DEFAULT_COMPARISON_MODEL = "anthropic/claude-sonnet-4.6";

export function comparisonModelLabel(modelId) {
  return COMPARISON_MODELS.find((model) => model.id === modelId)?.label ?? modelId;
}

export function isComparisonModel(modelId) {
  return COMPARISON_MODELS.some((model) => model.id === modelId);
}

