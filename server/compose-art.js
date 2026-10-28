import { composeArtWithJev } from "./compose-with-jev.js";
import { composeArtWithModel, isMissingGatewayAuth } from "./compose-with-model.js";
import { composeArtWithCode, isMissingSandboxAuth } from "./compose-with-code.js";

function compositionMode(body) {
  const mode = body?.mode ?? "jev";
  if (mode !== "jev" && mode !== "model" && mode !== "code") {
    throw new TypeError("Composition mode must be jev, model, or code.");
  }
  return mode;
}

export async function createComposeResponse(body) {
  let mode = "jev";
  try {
    mode = compositionMode(body);
    const composition = mode === "model"
      ? await composeArtWithModel(body)
      : mode === "code"
        ? await composeArtWithCode(body)
        : await composeArtWithJev(body);
    return { status: 200, body: composition };
  } catch (error) {
    if (error instanceof TypeError) {
      return { status: 400, body: { error: error.message, code: "INVALID_REQUEST" } };
    }
    if (mode === "code" && error?.code === "MISSING_SANDBOX_AUTH") {
      return { status: 503, body: { error: "Vercel Sandbox authentication is not configured.", code: "MISSING_SANDBOX_AUTH" } };
    }
    if (isMissingGatewayAuth(error)) {
      return { status: 503, body: { error: "AI Gateway authentication is not configured.", code: "MISSING_AI_GATEWAY_AUTH" } };
    }
    const routeLabel = mode === "model" ? "Comparison model" : mode === "code" ? "Code + Sandbox" : "Jev";
    console.error(`${routeLabel} art composition failed`, error);
    return {
      status: 502,
      body: {
        error: mode === "model"
          ? "The comparison model could not compose this artwork."
          : mode === "code"
            ? "The model or Sandbox could not build this artwork."
            : "Jev could not compose this artwork.",
        code: mode === "model" ? "MODEL_COMPOSITION_FAILED" : mode === "code" ? "CODE_COMPOSITION_FAILED" : "JEV_COMPOSITION_FAILED",
      },
    };
  }
}

