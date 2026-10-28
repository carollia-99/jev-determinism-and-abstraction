import { gateway } from "@ai-sdk/gateway";
import { experimental_decide as decide } from "ai";
import {
  ART_DECISION_COUNT,
  buildArtQuestions,
  seedFromPrompt,
} from "../shared/art-grammar.js";
import { createAIReceipt } from "./ai-receipt.js";
import {
  ART_ROUTING_THRESHOLD,
  THESIS_QUESTIONS,
  answerConfidence,
  buildRelevantArtRouting,
  extractExplicitColors,
  reconcileArtSpec,
  thesisFromAnswers,
} from "./art-reconciler.js";

const DEFAULT_MODEL = "typesafe-ai/jev-1.14.0";
const THESIS_DECISION_COUNT = Object.keys(THESIS_QUESTIONS).length;
export const MAX_ART_DECISION_COUNT = THESIS_DECISION_COUNT + ART_DECISION_COUNT - 1;
const CORE_THESIS_CONFIDENCE = 0.55;
const REFINABLE_THESIS_IDS = ["fieldIntent", "dominantColor", "colorCoverage", "formIntent"];

function roundProbability(value) {
  return Number.isFinite(value) ? Math.round(value * 10_000) / 10_000 : null;
}

function serializeDecision(id, question, answer) {
  let selected = null;
  if (answer?.type === "choice") selected = answer.choice;
  else if (answer?.type === "score") selected = roundProbability(answer.score);
  else if (answer?.type === "boolean") selected = answer.probability >= 0.5;

  const probabilities = answer?.type === "boolean"
    ? { true: roundProbability(answer.probability), false: roundProbability(1 - answer.probability) }
    : Object.fromEntries(Object.entries(answer?.probabilities ?? {}).map(([key, value]) => [key, roundProbability(value)]));

  return {
    id,
    type: question.type,
    instructions: question.instructions,
    criteria: question.criteria,
    selected,
    confidence: roundProbability(answerConfidence(answer)),
    probabilities,
  };
}

function serializeDecisions(questions, answers) {
  return Object.entries(questions).map(([id, question]) => serializeDecision(id, question, answers[id]));
}

function selectedAnswer(answer) {
  if (answer?.type === "choice") return answer.choice;
  if (answer?.type === "score") return roundProbability(answer.score);
  if (answer?.type === "boolean") return answer.probability >= 0.5;
  return null;
}

function createRoutingTrace({ literalConstraints, thesis, questions, skippedQuestions, thesisResult, thesisAnswers, refinementQuestions, refinementResult, acceptedRefinementIds, detailResult, omitted, repairs, provenance }) {
  const allDetailQuestionIds = Object.keys(buildArtQuestions()).filter((id) => id !== "fieldTreatment");
  const askedQuestionIds = Object.keys(questions);
  const asked = new Set(askedQuestionIds);
  const skippedQuestionIds = allDetailQuestionIds.filter((id) => !asked.has(id));
  const tier1Overrides = [
    `fieldTreatment ← Tier 1 ${thesis.fieldIntent}`,
    ...(!thesis.useMotion ? ["motion ← STILL because motion relevance is below threshold"] : []),
    ...(!thesis.useTexture ? ["texture ← CLEAN because texture relevance is below threshold"] : []),
    ...(!thesis.useSymmetry ? ["symmetry ← NONE because symmetry relevance is below threshold"] : []),
  ];

  return {
    constraints: literalConstraints,
    tier1: {
      decisions: serializeDecisions(THESIS_QUESTIONS, thesisAnswers),
      handoff: thesis,
      refinement: refinementResult ? {
        threshold: CORE_THESIS_CONFIDENCE,
        questionIds: Object.keys(refinementQuestions),
        acceptedQuestionIds: acceptedRefinementIds,
        initialDecisions: serializeDecisions(refinementQuestions, thesisResult.answers),
        decisions: serializeDecisions(refinementQuestions, refinementResult.answers),
      } : null,
    },
    routing: {
      threshold: ART_ROUTING_THRESHOLD,
      fieldIntent: thesis.fieldIntent,
      families: Object.entries(thesis.relevance).map(([family, score]) => ({
        family,
        score: roundProbability(score),
        routed: score >= ART_ROUTING_THRESHOLD,
      })),
      askedQuestionIds,
      skippedQuestionIds,
      skippedQuestions,
    },
    tier2: {
      decisions: serializeDecisions(questions, detailResult.answers),
    },
    compile: {
      defaultedQuestionIds: skippedQuestionIds,
      omittedQuestionIds: omitted,
      overrides: [...tier1Overrides, ...repairs],
      repairs,
      provenance,
    },
  };
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
  const emit = options.onProgress ?? (() => {});
  const literalConstraints = { colors: extractExplicitColors(prompt) };
  const thesisStartedAt = performance.now();
  emit({ stage: "thesis", status: "running", label: "Visual direction", message: "Jev is establishing the artwork’s visual direction…", detail: "Palette, composition, form, space, and motion" });
  const thesisResult = await decideFn({
    model,
    state: {
      userPrompt: prompt,
      medium: "Abstract generative artwork rendered with Canvas 2D through canvas-sketch.",
      literalConstraints,
      instruction:
        "Establish one coherent visual thesis. Preserve explicitly named visual properties and choose restraint when the prompt does not justify an effect.",
    },
    questions: THESIS_QUESTIONS,
  });
  const thesisLatencyMs = Math.round(performance.now() - thesisStartedAt);
  emit({ stage: "thesis", status: "complete", label: "Visual direction set", message: "Jev established the visual direction and is checking confidence…", detail: `${thesisLatencyMs} ms` });
  const thesisAnswers = { ...thesisResult.answers };
  const refinableIds = REFINABLE_THESIS_IDS.filter((id) => (answerConfidence(thesisAnswers[id]) ?? 0) < CORE_THESIS_CONFIDENCE);
  const refinementQuestions = Object.fromEntries(refinableIds.map((id) => [id, THESIS_QUESTIONS[id]]));
  let refinementResult = null;
  let refinementLatencyMs = 0;
  const acceptedRefinementIds = [];
  if (refinableIds.length) {
    const refinementStartedAt = performance.now();
    emit({ stage: "thesis-refinement", status: "running", label: "Rechecking uncertain choices", message: `Jev is rechecking ${refinableIds.length} uncertain visual ${refinableIds.length === 1 ? "choice" : "choices"}…`, detail: refinableIds.join(", ") });
    refinementResult = await decideFn({
      model,
      state: {
        userPrompt: prompt,
        medium: "Abstract generative artwork rendered with Canvas 2D through canvas-sketch.",
        literalConstraints,
        previousAnswers: Object.fromEntries(refinableIds.map((id) => [id, {
          selected: selectedAnswer(thesisAnswers[id]),
          confidence: roundProbability(answerConfidence(thesisAnswers[id])),
        }])),
        instruction:
          "Re-evaluate only these uncertain core visual decisions. Favor the interpretation that makes the prompt immediately recognizable in rendered pixels, especially dominant canvas color, coverage, and mark language.",
      },
      questions: refinementQuestions,
    });
    refinementLatencyMs = Math.round(performance.now() - refinementStartedAt);
    for (const id of refinableIds) {
      if ((answerConfidence(refinementResult.answers[id]) ?? 0) > (answerConfidence(thesisAnswers[id]) ?? 0)) {
        thesisAnswers[id] = refinementResult.answers[id];
        acceptedRefinementIds.push(id);
      }
    }
    emit({ stage: "thesis-refinement", status: "complete", label: "Uncertain choices rechecked", message: "Jev finished rechecking uncertain visual choices…", detail: `${acceptedRefinementIds.length} improved · ${refinementLatencyMs} ms` });
  }
  const thesis = thesisFromAnswers(thesisAnswers, literalConstraints);
  const { questions, skipped: skippedQuestions } = buildRelevantArtRouting(thesis);

  const detailStartedAt = performance.now();
  emit({ stage: "composition", status: "running", label: "Renderer choices", message: `Jev is resolving ${Object.keys(questions).length} relevant renderer characteristics…`, detail: "Only prompt-relevant questions are being asked" });
  const result = await decideFn({
    model,
    state: {
      userPrompt: prompt,
      medium: "Abstract generative artwork rendered with Canvas 2D through canvas-sketch.",
      visualThesis: thesis,
      literalConstraints,
      instruction:
        "Make only the requested relevant decisions. Preserve literal constraints before interpreting mood: named colors map to matching literal choices in mention order. Coordinate every answer with the supplied visual thesis.",
    },
    questions,
  });
  const detailLatencyMs = Math.round(performance.now() - detailStartedAt);
  emit({ stage: "composition", status: "complete", label: "Renderer choices complete", message: "Jev completed the renderer choices. Drawing the artwork…", detail: `${detailLatencyMs} ms` });

  const { spec, omitted, repairs, provenance } = reconcileArtSpec({
    prompt,
    thesis,
    answers: result.answers,
    seed: seedFromPrompt(prompt),
  });
  const allAnswers = [...Object.values(thesisAnswers), ...Object.values(result.answers)];
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
    ...(refinementResult ? [createAIReceipt(refinementResult, { model: refinementResult.response?.modelId ?? resolvedModel, latencyMs: refinementLatencyMs, stage: "thesis-refinement" })] : []),
    createAIReceipt(result, { model: resolvedModel, latencyMs: detailLatencyMs, stage: "composition" }),
  ];
  const trace = createRoutingTrace({
    literalConstraints,
    thesis,
    questions,
    skippedQuestions,
    thesisResult,
    thesisAnswers,
    refinementQuestions,
    refinementResult,
    acceptedRefinementIds,
    detailResult: result,
    omitted,
    repairs,
    provenance,
  });

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
    trace,
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
        ? { choice: "OMITTED", confidence: answerConfidence(thesisAnswers.fieldIntent) }
        : { choice: spec.layers[2].primitive, confidence: answerConfidence(result.answers.layer3_primitive) },
      space: { choice: spec.negativeSpace, confidence: answerConfidence(result.answers.negativeSpace) },
      motion: spec.motion === "STILL" && !thesis.useMotion
        ? { choice: "OMITTED", confidence: answerConfidence(thesisAnswers.motionImportance) }
        : { choice: spec.motion, confidence: answerConfidence(result.answers.motion) },
    },
    receipt: receipts.at(-1),
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
