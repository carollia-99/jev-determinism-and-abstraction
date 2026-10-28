import { composeArtWithJev } from "./compose-with-jev.js";
import { composeArtWithModel, isMissingGatewayAuth } from "./compose-with-model.js";

function compositionMode(body) {
  const mode = body?.mode ?? "jev";
  if (mode !== "jev" && mode !== "model") throw new TypeError("Composition mode must be jev or model.");
  return mode;
}

export async function createComposeResponse(body) {
  let mode = "jev";
  try {
    mode = compositionMode(body);
    const composition = mode === "model" ? await composeArtWithModel(body) : await composeArtWithJev(body);
    return { status: 200, body: composition };
  } catch (error) {
    if (error instanceof TypeError) {
      return { status: 400, body: { error: error.message, code: "INVALID_REQUEST" } };
    }
    if (isMissingGatewayAuth(error)) {
      return { status: 503, body: { error: "AI Gateway authentication is not configured.", code: "MISSING_AI_GATEWAY_AUTH" } };
    }
    console.error(`${mode === "model" ? "Comparison model" : "Jev"} art composition failed`, error);
    return {
      status: 502,
      body: {
        error: mode === "model" ? "The comparison model could not compose this artwork." : "Jev could not compose this artwork.",
        code: mode === "model" ? "MODEL_COMPOSITION_FAILED" : "JEV_COMPOSITION_FAILED",
      },
    };
  }
}

