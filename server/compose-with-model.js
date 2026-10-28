import { generateText, jsonSchema, Output } from "ai";
import {
  ART_DECISION_COUNT,
  buildArtSpecJsonSchema,
  seedFromPrompt,
} from "../shared/art-grammar.js";
import {
  DEFAULT_COMPARISON_MODEL,
  isComparisonModel,
} from "../shared/comparison-models.js";
import { createAIReceipt } from "./ai-receipt.js";
import { repairCompleteArtSpec } from "./art-reconciler.js";
import { validateComposeRequest } from "./compose-with-jev.js";

const artSpecSchema = jsonSchema(buildArtSpecJsonSchema());

function activePalette(spec) {
  return spec.fieldTreatment === "MARKS"
    ? `${spec.primaryColor} · ${spec.secondaryColor} · ${spec.accentColor}`
    : `${spec.gradientStartColor} → ${spec.gradientEndColor}`;
}

export async function composeArtWithModel(body, options = {}) {
  const { prompt } = validateComposeRequest(body);
  const generateTextFn = options.generateTextFn ?? generateText;
  const requestedModel = typeof body.model === "string" ? body.model.trim() : "";
  if (requestedModel && !isComparisonModel(requestedModel)) {
    throw new TypeError("The selected comparison model is not supported.");
  }
  const modelId = options.modelId ?? (requestedModel || process.env.COMPARISON_MODEL || DEFAULT_COMPARISON_MODEL);
  const startedAt = performance.now();
  const emit = options.onProgress ?? (() => {});
  emit({ stage: "model-composition", status: "running", label: "Populating art spec", message: "The selected model is generating the complete renderer spec…", detail: modelId });

  const result = await generateTextFn({
    model: options.model ?? modelId,
    output: Output.object({
      name: "canvasArtSpec",
      description: "A complete renderer-ready specification for one abstract Canvas 2D artwork.",
      schema: artSpecSchema,
    }),
    system: `You are the sole art director for a deterministic Canvas 2D renderer.

Translate the user's request into one complete ArtSpec. Every field is required. Coordinate all four layers as one artwork rather than four unrelated effects.

Rules:
- Preserve explicitly named colors literally and in mention order.
- Make ordinary subjects immediately recognizable through dominant color, field coverage, composition, and mark language.
- Use GEOMETRIC with circles, arcs, or polygons for explicit geometry; do not use ribbons as a substitute for geometry.
- Use a full color field when the subject is environmental light, weather, water, sky, terrain, or another continuous substance.
- Prefer restraint over adding effects that the prompt does not justify.
- Return only the schema-conforming object. Do not generate JavaScript, prose, or image data.`,
    prompt: `Compose this artwork: ${JSON.stringify(prompt)}`,
  });

  if (!result.output || typeof result.output !== "object") {
    throw new TypeError("The comparison model returned no complete ArtSpec.");
  }

  const { spec, repairs } = repairCompleteArtSpec({
    prompt,
    generatedSpec: result.output,
    seed: seedFromPrompt(prompt),
  });
  const latencyMs = Math.round(performance.now() - startedAt);
  const resolvedModel = result.response?.modelId ?? modelId;
  const receipt = createAIReceipt(result, {
    model: resolvedModel,
    latencyMs,
    stage: "model-composition",
  });
  emit({ stage: "model-composition", status: "complete", label: "Art spec complete", message: "The renderer spec is complete. Applying it to the canvas…", detail: `${resolvedModel} · ${latencyMs} ms` });

  return {
    source: "model-art",
    mode: "model",
    model: resolvedModel,
    latencyMs,
    decisionCount: ART_DECISION_COUNT,
    appliedDecisionCount: ART_DECISION_COUNT,
    skippedDecisionCount: 0,
    averageConfidence: null,
    omitted: [],
    repairs,
    spec,
    trace: {
      mode: "model-only",
      decisionCount: ART_DECISION_COUNT,
      repairs,
    },
    highlights: {
      composition: { choice: spec.composition, confidence: null },
      palette: { choice: activePalette(spec), confidence: null },
      marks: { choice: spec.layers[2].primitive, confidence: null },
      space: { choice: spec.negativeSpace, confidence: null },
      motion: { choice: spec.motion, confidence: null },
    },
    receipt,
    receipts: [receipt],
  };
}

export function isMissingGatewayAuth(error) {
  const message = error instanceof Error ? error.message : String(error);
  return error?.name === "LoadAPIKeyError" || message.includes("AI_GATEWAY_API_KEY") || message.includes("VERCEL_OIDC_TOKEN");
}

