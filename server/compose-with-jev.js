import { gateway } from "@ai-sdk/gateway";
import { experimental_decide as decide } from "ai";
import {
  ART_DECISION_COUNT,
} from "../shared/art-grammar.js";
import { createAIReceipt } from "./ai-receipt.js";
import {
  THESIS_QUESTIONS,
  answerConfidence,
  buildRelevantArtQuestions,
  reconcileArtSpec,
  thesisFromAnswers,
} from "./art-reconciler.js";

const DEFAULT_MODEL = "typesafe-ai/jev-1.14.0";
const THESIS_DECISION_COUNT = Object.keys(THESIS_QUESTIONS).length;
export const MAX_ART_DECISION_COUNT = THESIS_DECISION_COUNT + ART_DECISION_COUNT;

function promptSeed(prompt) {
  let hash = 2166136261;
  for (const character of prompt) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function validateComposeRequest(body) {
  if (!body || typeof body !== "object") throw new TypeError("Request body must be a JSON object.");
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw new TypeError("Prompt is required.");
  if (prompt.length > 500) throw new TypeError("Prompt must be 500 characters or fewer.");
  return { prompt };
}

export async function composeArtWithJev(body, options = {}) {
  const { prompt } = validateComposeRequest(body);
  const decideFn = options.decideFn ?? decide;
  const modelId = options.modelId ?? process.env.JEV_MODEL ?? DEFAULT_MODEL;
  const model = options.model ?? gateway.decisionModel(modelId);
  const startedAt = performance.now();
  const thesisStartedAt = performance.now();
  const thesisResult = await decideFn({
    model,
    state: {
      userPrompt: prompt,
      medium: "Abstract generative artwork rendered with Canvas 2D through canvas-sketch.",
      instruction:
        "Establish one coherent visual thesis. Preserve explicitly named visual properties and choose restraint when the prompt does not justify an effect.",
    },
    questions: THESIS_QUESTIONS,
  });
  const thesisLatencyMs = Math.round(performance.now() - thesisStartedAt);
  const thesis = thesisFromAnswers(thesisResult.answers);
  const questions = buildRelevantArtQuestions(thesis);

  const detailStartedAt = performance.now();
  const result = await decideFn({
    model,
    state: {
      userPrompt: prompt,
      medium: "Abstract generative artwork rendered with Canvas 2D through canvas-sketch.",
      visualThesis: thesis,
      instruction:
        "Make only the requested relevant decisions. Preserve literal constraints before interpreting mood: named colors map to matching literal choices in mention order. Coordinate every answer with the supplied visual thesis.",
    },
    questions,
  });
  const detailLatencyMs = Math.round(performance.now() - detailStartedAt);

  const { spec, omitted, repairs } = reconcileArtSpec({
    prompt,
    thesis,
    answers: result.answers,
    seed: promptSeed(prompt),
  });
  const allAnswers = [...Object.values(thesisResult.answers), ...Object.values(result.answers)];
  const confidences = allAnswers.map(answerConfidence).filter(Number.isFinite);
  const averageConfidence =
    confidences.length > 0 ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null;
  const latencyMs = Math.round(performance.now() - startedAt);
  const resolvedModel = result.response?.modelId ?? modelId;
  const decisionCount = THESIS_DECISION_COUNT + Object.keys(questions).length;
  const skippedDecisionCount = MAX_ART_DECISION_COUNT - decisionCount;
  const appliedDecisionCount = decisionCount - omitted.length;
  const receipts = [
    createAIReceipt(thesisResult, { model: thesisResult.response?.modelId ?? resolvedModel, latencyMs: thesisLatencyMs, stage: "thesis" }),
    createAIReceipt(result, { model: resolvedModel, latencyMs: detailLatencyMs, stage: "composition" }),
  ];

  return {
    source: "jev-art",
    model: resolvedModel,
    latencyMs,
    decisionCount,
    appliedDecisionCount,
    skippedDecisionCount,
    averageConfidence,
    thesis,
    omitted,
    repairs,
    spec,
    highlights: {
      composition: { choice: spec.composition, confidence: answerConfidence(result.answers.composition) },
      palette: {
        choice: spec.fieldTreatment === "MARKS"
          ? `${spec.primaryColor} · ${spec.secondaryColor} · ${spec.accentColor}`
          : `${spec.gradientStartColor} → ${spec.gradientEndColor}`,
        confidence: spec.fieldTreatment === "MARKS"
          ? answerConfidence(result.answers.primaryColor)
          : Math.min(answerConfidence(result.answers.gradientStartColor) ?? 0, answerConfidence(result.answers.gradientEndColor) ?? 0),
      },
      marks: spec.fieldTreatment === "GRADIENT" || spec.fieldTreatment === "SOLID"
        ? { choice: "OMITTED", confidence: answerConfidence(thesisResult.answers.fieldIntent) }
        : { choice: spec.layers[2].primitive, confidence: answerConfidence(result.answers.layer3_primitive) },
      space: { choice: spec.negativeSpace, confidence: answerConfidence(result.answers.negativeSpace) },
      motion: spec.motion === "STILL" && !thesis.useMotion
        ? { choice: "OMITTED", confidence: answerConfidence(thesisResult.answers.useMotion) }
        : { choice: spec.motion, confidence: answerConfidence(result.answers.motion) },
    },
    receipt: receipts[1],
    receipts,
  };
}

function isMissingGatewayAuth(error) {
  const message = error instanceof Error ? error.message : String(error);
  return error?.name === "LoadAPIKeyError" || message.includes("AI_GATEWAY_API_KEY") || message.includes("VERCEL_OIDC_TOKEN");
}

export async function createComposeResponse(body) {
  try {
    return { status: 200, body: await composeArtWithJev(body) };
  } catch (error) {
    if (error instanceof TypeError) {
      return { status: 400, body: { error: error.message, code: "INVALID_REQUEST" } };
    }
    if (isMissingGatewayAuth(error)) {
      return { status: 503, body: { error: "AI Gateway authentication is not configured.", code: "MISSING_AI_GATEWAY_AUTH" } };
    }
    console.error("Jev art composition failed", error);
    return { status: 502, body: { error: "Jev could not compose this artwork.", code: "JEV_COMPOSITION_FAILED" } };
  }
}
