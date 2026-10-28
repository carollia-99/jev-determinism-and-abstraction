import { generateText, jsonSchema, Output } from "ai";
import { validateInterpretRequest } from "./interpret-with-jev.js";
import {
  MAX_CAPABILITY_CODE_LENGTH,
  MOTION_CONTRACT_VERSION,
  motionCapabilityContract,
  validateCapabilityCode,
} from "../shared/motion-contract.js";
import { createAIReceipt } from "./ai-receipt.js";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";
export { motionCapabilityContract };

const capabilitySchema = jsonSchema({
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "code"],
  properties: {
    name: {
      type: "string",
      pattern: "^[A-Z][A-Z0-9_]{2,31}$",
      description: "A concise uppercase capability identifier such as FLOCK or WAVE_PULSE.",
    },
    description: {
      type: "string",
      minLength: 12,
      maxLength: 180,
      description: "One plain-language sentence describing the proposed particle behavior.",
    },
    code: {
      type: "string",
      minLength: 80,
      maxLength: MAX_CAPABILITY_CODE_LENGTH,
      description:
        "A JavaScript module containing exactly one exported applyMotion(particle, context) function.",
    },
  },
});

function validateProposedState(value, capabilities) {
  validateInterpretRequest({ prompt: "validate", currentState: value, capabilities });
  return { ...value };
}

export function validateCapabilityRequest(body) {
  const { prompt, currentState, capabilities } = validateInterpretRequest(body);
  const proposedState = validateProposedState(body.proposedState, capabilities);
  return { prompt, currentState, proposedState, capabilities };
}

export async function generateCapabilityProposal(body, options = {}) {
  const { prompt, currentState, proposedState, capabilities } = validateCapabilityRequest(body);
  const generateTextFn = options.generateTextFn ?? generateText;
  const modelId = options.modelId ?? process.env.CAPABILITY_MODEL ?? DEFAULT_MODEL;
  const startedAt = performance.now();
  const contract = motionCapabilityContract;

  const result = await generateTextFn({
    model: modelId,
    output: Output.object({
      name: "motionCapabilityProposal",
      description: "A quarantined particle-motion capability proposal.",
      schema: capabilitySchema,
    }),
    system: `You design one small deterministic motion primitive for a canvas particle system.

Return JavaScript that strictly follows this contract:
- The entire module is exactly one function: ${contract.signature} { ... }
- particle has numeric fields: ${contract.particle.join(", ")}.
- context has numeric fields: ${contract.context.join(", ")}.
- ${contract.mutation}
- Do not assign x, y, id, size, or phase.
- Do not import packages, access globals, perform I/O, allocate timers, or use randomness.
- Use only local arithmetic and Math functions.
- Keep acceleration bounded and guard division by zero.
- Do not include markdown fences, comments, or commentary in code.

This output is only a proposal. It will not be executed until a later sandbox-validation stage.`,
    prompt: `User intent: ${JSON.stringify(prompt)}
Current artwork state: ${JSON.stringify(currentState)}
Jev's closest bounded state: ${JSON.stringify(proposedState)}
Existing session capabilities: ${JSON.stringify(capabilities)}

Propose one new motion primitive that expresses the intent better than DRIFT, JITTER, ORBIT, or REPEL.`,
  });

  const output = result.output;
  if (!output || typeof output !== "object") {
    throw new TypeError("The capability model returned no structured proposal.");
  }

  const latencyMs = Math.round(performance.now() - startedAt);
  const resolvedModel = result.response?.modelId ?? modelId;

  return {
    proposal: {
      name: output.name,
      description: output.description,
      code: validateCapabilityCode(output.code),
      status: "quarantined",
      contract: MOTION_CONTRACT_VERSION,
    },
    source: "capability-model",
    model: resolvedModel,
    latencyMs,
    receipt: createAIReceipt(result, { model: resolvedModel, latencyMs, stage: "generation" }),
    executed: false,
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

export async function createCapabilityResponse(body) {
  try {
    return { status: 200, body: await generateCapabilityProposal(body) };
  } catch (error) {
    if (error instanceof TypeError) {
      return { status: 400, body: { error: error.message, code: "INVALID_CAPABILITY_PROPOSAL" } };
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

    console.error("Capability generation failed", error);
    return {
      status: 502,
      body: { error: "The capability model could not create a proposal.", code: "CAPABILITY_REQUEST_FAILED" },
    };
  }
}
