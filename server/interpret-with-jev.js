import { gateway } from "@ai-sdk/gateway";
import { experimental_decide as decide } from "ai";
import { createAIReceipt } from "./ai-receipt.js";

const MOTIONS = Object.freeze(["DRIFT", "JITTER", "ORBIT", "REPEL"]);
const LEVELS = Object.freeze(["LOW", "MEDIUM", "HIGH"]);
const DEFAULT_MODEL = "typesafe-ai/jev-1.14.0";
const DEFAULT_CAPABILITY_THRESHOLD = 0.6;

const BUILTIN_CRITERIA = Object.freeze({
  DRIFT: "Slow, calm, gentle, peaceful, dreamy, or loosely floating movement.",
  JITTER: "Anxious, frantic, chaotic, nervous, sharp, or agitated movement.",
  ORBIT: "Energetic, lively, rhythmic, excited, coordinated, or circular movement.",
  REPEL: "Scattering, exploding, pushing away, isolating, or expanding movement.",
});

const levelQuestions = Object.freeze({
  speed: {
    type: "choice",
    instructions: "Choose the overall particle speed that best matches the user's intent.",
    criteria: {
      LOW: "Slow, still, restful, gentle, subdued, or quiet.",
      MEDIUM: "Balanced, neutral, moderate, or unspecified speed.",
      HIGH: "Fast, urgent, frantic, energetic, intense, or excited.",
    },
  },
  energy: {
    type: "choice",
    instructions: "Choose the force and visual energy that best matches the user's intent.",
    criteria: {
      LOW: "Soft, peaceful, restrained, minimal, or calm.",
      MEDIUM: "Balanced, steady, moderate, or unspecified energy.",
      HIGH: "Forceful, chaotic, bold, anxious, explosive, or highly energetic.",
    },
  },
});

function createQuestions(capabilities) {
  const criteria = {
    ...BUILTIN_CRITERIA,
    ...Object.fromEntries(
      capabilities.map(({ name, description }) => [name, `Session capability: ${description}`]),
    ),
  };
  const names = Object.keys(criteria).join(", ");

  return {
    capabilitySufficient: {
      type: "boolean",
      instructions: `Can the user's request be expressed well using one of these currently executable motion capabilities: ${names}, plus LOW, MEDIUM, or HIGH speed and energy? Return false when the request requires a genuinely different motion algorithm, shape, color, density, or behavior. When uncertain, return false.`,
    },
    motion: {
      type: "choice",
      instructions:
        "Choose the currently executable motion capability that best expresses the user's requested intent. Prefer an exact session capability when the user names or clearly refers to it.",
      criteria,
    },
    ...levelQuestions,
  };
}

function validateSessionCapabilities(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) {
    throw new TypeError("Session capabilities must be an array of at most 8 items.");
  }

  const names = new Set();
  return value.map((capability) => {
    const name = typeof capability?.name === "string" ? capability.name.trim() : "";
    const description = typeof capability?.description === "string" ? capability.description.trim() : "";
    if (!/^[A-Z][A-Z0-9_]{2,31}$/.test(name) || MOTIONS.includes(name) || names.has(name)) {
      throw new TypeError("Session capability name is invalid.");
    }
    if (!description || description.length > 180) {
      throw new TypeError("Session capability description is invalid.");
    }
    names.add(name);
    return { name, description };
  });
}

function isArtState(value, allowedMotions = MOTIONS) {
  return (
    value &&
    typeof value === "object" &&
    allowedMotions.includes(value.motion) &&
    LEVELS.includes(value.speed) &&
    LEVELS.includes(value.energy)
  );
}

export function validateInterpretRequest(body) {
  if (!body || typeof body !== "object") {
    throw new TypeError("Request body must be a JSON object.");
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const capabilities = validateSessionCapabilities(body.capabilities);
  const allowedMotions = [...MOTIONS, ...capabilities.map(({ name }) => name)];
  if (!prompt) throw new TypeError("Prompt is required.");
  if (prompt.length > 500) throw new TypeError("Prompt must be 500 characters or fewer.");
  if (!isArtState(body.currentState, allowedMotions)) throw new TypeError("Current artwork state is invalid.");

  return { prompt, currentState: { ...body.currentState }, capabilities, allowedMotions };
}

function decisionSummary(answer) {
  const confidence = answer.probabilities?.[answer.choice];
  return {
    choice: answer.choice,
    confidence: Number.isFinite(confidence) ? confidence : null,
  };
}

function getCapabilityThreshold(value) {
  const threshold = Number(value ?? process.env.JEV_CAPABILITY_THRESHOLD ?? DEFAULT_CAPABILITY_THRESHOLD);
  return Number.isFinite(threshold) && threshold >= 0 && threshold <= 1
    ? threshold
    : DEFAULT_CAPABILITY_THRESHOLD;
}

export async function interpretWithJev(body, options = {}) {
  const { prompt, currentState, capabilities, allowedMotions } = validateInterpretRequest(body);
  const decideFn = options.decideFn ?? decide;
  const modelId = options.modelId ?? process.env.JEV_MODEL ?? DEFAULT_MODEL;
  const model = options.model ?? gateway.decisionModel(modelId);
  const capabilityThreshold = getCapabilityThreshold(options.capabilityThreshold);
  const questions = createQuestions(capabilities);
  const startedAt = performance.now();

  const result = await decideFn({
    model,
    state: {
      userPrompt: prompt,
      currentArtworkState: currentState,
      availableMotionPrimitives: allowedMotions,
      sessionCapabilities: capabilities,
      availableLevels: LEVELS,
      constraint: "Return only the best available bounded choice for each question.",
    },
    questions,
  });

  const nextState = {
    motion: result.answers.motion.choice,
    speed: result.answers.speed.choice,
    energy: result.answers.energy.choice,
  };

  if (!isArtState(nextState, allowedMotions)) {
    throw new TypeError("Jev returned an unsupported artwork state.");
  }

  const sufficientProbability = result.answers.capabilitySufficient.probability;
  if (!Number.isFinite(sufficientProbability)) {
    throw new TypeError("Jev returned an invalid capability decision.");
  }

  const capabilitySufficient = sufficientProbability >= capabilityThreshold;

  const reusesSessionCapability = capabilities.some(({ name }) => name === nextState.motion);
  const latencyMs = Math.round(performance.now() - startedAt);
  const resolvedModel = result.response?.modelId ?? modelId;

  return {
    state: capabilitySufficient ? nextState : currentState,
    proposedState: nextState,
    source: "jev",
    model: resolvedModel,
    latencyMs,
    receipt: createAIReceipt(result, { model: resolvedModel, latencyMs, stage: "decision" }),
    decisions: {
      motion: decisionSummary(result.answers.motion),
      speed: decisionSummary(result.answers.speed),
      energy: decisionSummary(result.answers.energy),
    },
    capability: {
      sufficient: capabilitySufficient,
      probability: sufficientProbability,
      confidence: capabilitySufficient ? sufficientProbability : 1 - sufficientProbability,
      threshold: capabilityThreshold,
      action: capabilitySufficient
        ? reusesSessionCapability
          ? "reuse_session"
          : "reuse_existing"
        : "generate_new",
    },
  };
}

function isMissingGatewayAuth(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    error?.name === "LoadAPIKeyError" ||
    message.includes("AI_GATEWAY_API_KEY") ||
    message.includes("VERCEL_OIDC_TOKEN")
  );
}

export async function createInterpretResponse(body) {
  try {
    return { status: 200, body: await interpretWithJev(body) };
  } catch (error) {
    if (error instanceof TypeError) {
      return { status: 400, body: { error: error.message, code: "INVALID_REQUEST" } };
    }

    if (isMissingGatewayAuth(error)) {
      return {
        status: 503,
        body: {
          error: "AI Gateway authentication is not configured.",
          code: "MISSING_AI_GATEWAY_AUTH",
        },
      };
    }

    console.error("Jev interpretation failed", error);
    return {
      status: 502,
      body: { error: "Jev could not interpret this prompt.", code: "JEV_REQUEST_FAILED" },
    };
  }
}
