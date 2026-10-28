import { composeArtWithJev } from "./compose-with-jev.js";
import { composeArtWithModel, isMissingGatewayAuth } from "./compose-with-model.js";
import { composeArtWithCode, isMissingSandboxAuth } from "./compose-with-code.js";
import { composeArtWithImage } from "./compose-with-image.js";
import { routePromptWithJev } from "./route-with-jev.js";

function compositionMode(body) {
  const mode = body?.mode ?? "jev";
  if (mode !== "jev" && mode !== "model" && mode !== "code" && mode !== "image") {
    throw new TypeError("Composition mode must be jev, model, code, or image.");
  }
  return mode;
}

export async function composeArt(body, options = {}) {
  const mode = compositionMode(body);
  const emit = options.onProgress ?? (() => {});
  if (mode === "model") return (options.composeModel ?? composeArtWithModel)(body, { ...options.model, onProgress: emit });
  if (mode === "code") return (options.composeCode ?? composeArtWithCode)(body, { ...options.code, onProgress: emit });
  if (mode === "image") return (options.composeImage ?? composeArtWithImage)(body, { ...options.image, onProgress: emit });
  if (body?.live === true) return (options.composeJev ?? composeArtWithJev)(body, { ...options.jev, onProgress: emit });

  emit({ stage: "route-check", status: "running", label: "Jev route check", message: "Jev is checking whether the fixed renderer can express this prompt…", detail: "Comparing populate spec with custom code" });
  const route = await (options.routeJev ?? routePromptWithJev)(body, options.routing);
  const routeReason = route.reason ?? (route.route === "CUSTOM_CODE"
    ? "The prompt requires capabilities outside the fixed renderer."
    : "The fixed renderer covers the prompt’s important visual characteristics.");
  const routeConfidence = Number.isFinite(route.confidence) ? `${Math.round(route.confidence * 100)}% confidence` : "confidence unavailable";
  emit({
    stage: "route-check",
    status: "complete",
    label: route.route === "CUSTOM_CODE" ? "Rerouting to custom code" : "Populate spec selected",
    message: route.route === "CUSTOM_CODE" ? `Jev is rerouting to custom code. ${routeReason}` : `Jev selected the fixed renderer. ${routeReason}`,
    detail: `Jev · ${routeConfidence}`,
    route: route.route,
    routeReason,
  });
  let composition;
  try {
    composition = route.route === "CUSTOM_CODE"
      ? await (options.composeCode ?? composeArtWithCode)(body, {
        ...options.code,
        onProgress: (progress) => emit({ ...progress, autoRouted: true, routeReason }),
      })
      : await (options.composeJev ?? composeArtWithJev)(body, { ...options.jev, onProgress: emit });
  } catch (error) {
    if (route.route === "CUSTOM_CODE" && error && typeof error === "object") error.autoRoutedFromJev = true;
    throw error;
  }
  return {
    ...composition,
    latencyMs: route.latencyMs + composition.latencyMs,
    receipts: [route.receipt, ...composition.receipts],
    autoRoute: {
      requestedMode: "jev",
      selected: route.route,
      requested: route.requestedRoute,
      confidence: route.confidence,
      threshold: route.threshold,
      reason: routeReason,
      model: route.model,
      latencyMs: route.latencyMs,
    },
    trace: route.route === "CUSTOM_CODE"
      ? { ...composition.trace, route }
      : { ...composition.trace, gate: route },
  };
}

export async function createComposeResponse(body) {
  let mode = "jev";
  try {
    mode = compositionMode(body);
    const composition = await composeArt(body);
    return { status: 200, body: composition };
  } catch (error) {
    if (error instanceof TypeError) {
      return { status: 400, body: { error: error.message, code: "INVALID_REQUEST" } };
    }
    if (isMissingSandboxAuth(error)) {
      return { status: 503, body: { error: "Vercel Sandbox authentication is not configured.", code: "MISSING_SANDBOX_AUTH" } };
    }
    if (isMissingGatewayAuth(error)) {
      return { status: 503, body: { error: "AI Gateway authentication is not configured.", code: "MISSING_AI_GATEWAY_AUTH" } };
    }
    const codeFailure = mode === "code" || error?.autoRoutedFromJev;
    const routeLabel = mode === "model" ? "Comparison model" : mode === "image" ? "Image model" : codeFailure ? "Custom code + Sandbox" : "Jev";
    const detail = publicComposeErrorDetail(error, codeFailure);
    console.error(`${routeLabel} art composition failed`, error);
    return {
      status: 502,
      body: {
        error: mode === "model"
          ? "The comparison model could not compose this artwork."
          : mode === "image"
            ? "The image model could not generate this artwork."
          : codeFailure
            ? "The model or Sandbox could not build this artwork."
            : "Jev could not compose this artwork.",
        code: mode === "model" ? "MODEL_COMPOSITION_FAILED" : mode === "image" ? "IMAGE_GENERATION_FAILED" : codeFailure ? "CODE_COMPOSITION_FAILED" : "JEV_COMPOSITION_FAILED",
        ...(detail ? { detail } : {}),
      },
    };
  }
}

function publicComposeErrorDetail(error, codeFailure) {
  const message = error instanceof Error ? error.message : "";
  if (!message) return null;
  if (error instanceof TypeError) return message.slice(0, 240);
  if (codeFailure && /^(JavaScript syntax check|Sandbox execution|Sandbox preview did not become ready)/.test(message)) {
    return message.replace(/\s+/g, " ").slice(0, 240);
  }
  return null;
}

export function createComposeErrorResponse(error, mode = "jev") {
  if (error instanceof TypeError) {
    return { status: 400, body: { error: error.message, code: "INVALID_REQUEST" } };
  }
  if (isMissingSandboxAuth(error)) {
    return { status: 503, body: { error: "Vercel Sandbox authentication is not configured.", code: "MISSING_SANDBOX_AUTH" } };
  }
  if (isMissingGatewayAuth(error)) {
    return { status: 503, body: { error: "AI Gateway authentication is not configured.", code: "MISSING_AI_GATEWAY_AUTH" } };
  }
  const codeFailure = mode === "code" || error?.autoRoutedFromJev;
  const detail = publicComposeErrorDetail(error, codeFailure);
  return {
    status: 502,
    body: {
      error: mode === "model"
        ? "The comparison model could not compose this artwork."
        : mode === "image"
          ? "The image model could not generate this artwork."
        : codeFailure
          ? "The model or Sandbox could not build this artwork."
          : "Jev could not compose this artwork.",
      code: mode === "model" ? "MODEL_COMPOSITION_FAILED" : mode === "image" ? "IMAGE_GENERATION_FAILED" : codeFailure ? "CODE_COMPOSITION_FAILED" : "JEV_COMPOSITION_FAILED",
      ...(detail ? { detail } : {}),
    },
  };
}

