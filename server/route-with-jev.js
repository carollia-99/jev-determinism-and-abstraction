import { gateway } from "@ai-sdk/gateway";
import { experimental_decide as decide } from "ai";
import { createAIReceipt } from "./ai-receipt.js";
import { validateComposeRequest } from "./compose-with-jev.js";

const DEFAULT_MODEL = "typesafe-ai/jev-1.14.0";
const CUSTOM_CODE_CONFIDENCE = 0.65;

export const COMPOSITION_ROUTE_QUESTION = Object.freeze({
  compositionRoute: {
    type: "choice",
    instructions: `Decide whether the fixed abstract-art renderer can faithfully express the prompt or whether it needs custom Canvas JavaScript.

POPULATE_SPEC supports palettes, gradients, abstract marks, geometric and organic forms, composition, negative space, texture, atmosphere, symmetry, depth, and basic animation.

CUSTOM_CODE is only for prompts whose identity depends on capabilities outside that grammar, such as a specific recognizable scene or object arrangement, typography, illustrative characters, unusual simulation, interaction, or a bespoke drawing technique. Do not choose CUSTOM_CODE merely because a prompt is vivid, detailed, colorful, atmospheric, geometric, or animated. When uncertain, choose POPULATE_SPEC.`,
    criteria: {
      POPULATE_SPEC: "The fixed renderer can preserve the prompt's important visual identity.",
      CUSTOM_CODE: "The prompt's important identity requires bespoke Canvas JavaScript beyond the fixed renderer.",
    },
  },
  routeReason: {
    type: "choice",
    instructions: "Identify the capability that most strongly determines the route. Choose SPEC_IS_ENOUGH when the fixed abstract renderer can preserve the important identity of the prompt.",
    criteria: {
      SPEC_IS_ENOUGH: "Palette, composition, marks, texture, atmosphere, depth, and basic motion are sufficient.",
      RECOGNIZABLE_SCENE: "A specific recognizable scene or object arrangement is essential.",
      TYPOGRAPHY: "Readable words, labels, numbers, or typographic layout are essential.",
      INTERACTION: "Pointer, keyboard, or other viewer interaction is essential.",
      SIMULATION: "A bespoke physical, procedural, or agent-like simulation is essential.",
      BESPOKE_TECHNIQUE: "The requested drawing technique cannot be represented by the fixed controls.",
    },
  },
});

const ROUTE_REASONS = Object.freeze({
  SPEC_IS_ENOUGH: "The fixed renderer covers the prompt’s important visual characteristics.",
  RECOGNIZABLE_SCENE: "The prompt depends on a recognizable scene or object arrangement outside the fixed spec.",
  TYPOGRAPHY: "The prompt depends on readable typography, which the fixed spec cannot express.",
  INTERACTION: "The prompt depends on viewer interaction, which requires custom JavaScript.",
  SIMULATION: "The prompt depends on a bespoke simulation outside the fixed renderer.",
  BESPOKE_TECHNIQUE: "The prompt depends on a drawing technique outside the fixed renderer.",
});

function choiceConfidence(answer) {
  const selected = answer?.probabilities?.[answer?.choice];
  return Number.isFinite(selected) ? selected : null;
}

function serializeRouteDecision(id, question, answer) {
  return {
    id,
    type: question.type,
    instructions: question.instructions,
    criteria: question.criteria,
    selected: answer?.choice ?? null,
    confidence: choiceConfidence(answer),
    probabilities: Object.fromEntries(
      Object.entries(answer?.probabilities ?? {}).filter(([, probability]) => Number.isFinite(probability)),
    ),
  };
}

export async function routePromptWithJev(body, options = {}) {
  const { prompt } = validateComposeRequest(body);
  const decideFn = options.decideFn ?? decide;
  const modelId = options.modelId ?? process.env.JEV_MODEL ?? DEFAULT_MODEL;
  const model = options.model ?? gateway.decisionModel(modelId);
  const startedAt = performance.now();
  const result = await decideFn({
    model,
    state: {
      userPrompt: prompt,
      availableSpec: "A fixed abstract Canvas 2D grammar with 80+ typed controls.",
      customRoute: "Claude Sonnet 4.6 writes self-contained Canvas JavaScript that is validated and run in Vercel Sandbox.",
      instruction: "Route by required capability, not by prompt length. Preserve the faster fixed-spec path whenever it is expressive enough.",
    },
    questions: COMPOSITION_ROUTE_QUESTION,
  });
  const latencyMs = Math.round(performance.now() - startedAt);
  const answer = result.answers?.compositionRoute;
  const reasonAnswer = result.answers?.routeReason;
  const requestedRoute = answer?.choice === "CUSTOM_CODE" ? "CUSTOM_CODE" : "POPULATE_SPEC";
  const confidence = choiceConfidence(answer);
  const route = requestedRoute === "CUSTOM_CODE" && (confidence ?? 0) >= CUSTOM_CODE_CONFIDENCE
    ? "CUSTOM_CODE"
    : "POPULATE_SPEC";
  const resolvedModel = result.response?.modelId ?? modelId;
  const reasonKey = route === "CUSTOM_CODE" && reasonAnswer?.choice !== "SPEC_IS_ENOUGH"
    ? reasonAnswer?.choice
    : "SPEC_IS_ENOUGH";

  return {
    route,
    requestedRoute,
    confidence,
    threshold: CUSTOM_CODE_CONFIDENCE,
    reason: ROUTE_REASONS[reasonKey] ?? (route === "CUSTOM_CODE"
      ? "The prompt requires capabilities outside the fixed renderer."
      : ROUTE_REASONS.SPEC_IS_ENOUGH),
    decisions: Object.entries(COMPOSITION_ROUTE_QUESTION).map(([id, question]) =>
      serializeRouteDecision(id, question, result.answers?.[id])),
    model: resolvedModel,
    latencyMs,
    receipt: createAIReceipt(result, {
      model: resolvedModel,
      latencyMs,
      stage: "composition-route",
    }),
  };
}
