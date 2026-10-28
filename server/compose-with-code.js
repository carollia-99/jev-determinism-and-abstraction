import { Sandbox } from "@vercel/sandbox";
import { generateText, jsonSchema, Output } from "ai";
import { createAIReceipt } from "./ai-receipt.js";
import { validateComposeRequest } from "./compose-with-jev.js";
import { DEFAULT_COMPARISON_MODEL, isComparisonModel } from "../shared/comparison-models.js";

const PREVIEW_PORT = 4173;
const SANDBOX_TIMEOUT_MS = 5 * 60 * 1000;
const generatedArtworkSchema = jsonSchema({
  type: "object",
  additionalProperties: false,
  required: ["title", "code"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 80 },
    code: { type: "string", minLength: 1, maxLength: 60_000 },
  },
});

const BLOCKED_CODE_PATTERNS = [
  [/(?:^|\W)(?:import|export)\s/m, "module imports"],
  [/\brequire\s*\(/, "CommonJS imports"],
  [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|SharedWorker)\b/, "network APIs"],
  [/\b(?:localStorage|sessionStorage|indexedDB)\b/, "browser storage"],
  [/\bdocument\.cookie\b/, "cookies"],
  [/\b(?:parent|top|opener)\b/, "parent-window access"],
  [/\b(?:eval|Function)\s*\(/, "dynamic code evaluation"],
];

function validateGeneratedCode(code) {
  if (typeof code !== "string" || !code.trim()) throw new TypeError("The code model returned no JavaScript.");
  if (code.length > 60_000) throw new TypeError("The generated JavaScript is too large to preview.");
  for (const [pattern, label] of BLOCKED_CODE_PATTERNS) {
    if (pattern.test(code)) throw new TypeError(`The generated JavaScript attempted to use ${label}.`);
  }
  return code.trim();
}

function previewHtml(title) {
  const safeTitle = title.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[character]));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeTitle}</title>
  <style>html,body,#art{width:100%;height:100%;margin:0;overflow:hidden;background:#050505}#art{display:block}</style>
</head>
<body><canvas id="art" aria-label="${safeTitle}"></canvas><script src="/sketch.js"></script></body>
</html>`;
}

const VALIDATOR_SOURCE = String.raw`import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync("sketch.js", "utf8");
const gradient = { addColorStop() {} };
const context2d = new Proxy({
  canvas: null,
  createLinearGradient: () => gradient,
  createRadialGradient: () => gradient,
  createConicGradient: () => gradient,
  createPattern: () => ({}),
  measureText: (text) => ({ width: String(text).length * 8 }),
  getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(Math.max(0, width * height * 4)), width, height }),
}, { get: (target, key) => key in target ? target[key] : () => {} });
const canvas = {
  width: 1024,
  height: 768,
  style: {},
  getContext: (type) => type === "2d" ? context2d : null,
  addEventListener() {},
  removeEventListener() {},
  getBoundingClientRect: () => ({ x: 0, y: 0, width: 1024, height: 768, top: 0, right: 1024, bottom: 768, left: 0 }),
};
context2d.canvas = canvas;
const document = {
  body: { appendChild() {}, style: {} },
  documentElement: { clientWidth: 1024, clientHeight: 768 },
  getElementById: (id) => id === "art" ? canvas : null,
  querySelector: (selector) => selector === "#art" || selector === "canvas" ? canvas : null,
  createElement: (tag) => tag === "canvas" ? canvas : { style: {}, appendChild() {}, addEventListener() {} },
  addEventListener() {},
};
const sandbox = {
  console,
  document,
  innerWidth: 1024,
  innerHeight: 768,
  devicePixelRatio: 1,
  requestAnimationFrame: () => 1,
  cancelAnimationFrame() {},
  addEventListener() {},
  removeEventListener() {},
  setTimeout: () => 1,
  clearTimeout() {},
  performance: { now: () => 0 },
  Math,
  Date,
  Uint8ClampedArray,
  Path2D: class Path2D {},
  DOMMatrix: class DOMMatrix {},
  Image: class Image {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
new vm.Script(code, { filename: "sketch.js" }).runInNewContext(sandbox, { timeout: 3000 });
console.log("Generated artwork executed successfully.");`;

const SERVER_SOURCE = String.raw`import http from "node:http";
import fs from "node:fs";

const files = {
  "/": ["text/html; charset=utf-8", "index.html"],
  "/index.html": ["text/html; charset=utf-8", "index.html"],
  "/sketch.js": ["text/javascript; charset=utf-8", "sketch.js"],
};
const csp = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; media-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors *";
http.createServer((request, response) => {
  const file = files[new URL(request.url, "http://sandbox").pathname];
  response.setHeader("Content-Security-Policy", csp);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
  if (!file) { response.writeHead(404); response.end("Not found"); return; }
  response.writeHead(200, { "Content-Type": file[0] });
  fs.createReadStream(file[1]).pipe(response);
}).listen(${PREVIEW_PORT}, "0.0.0.0");`;

async function commandError(command, label) {
  if (command.exitCode === 0) return null;
  const stderr = typeof command.stderr === "function" ? await command.stderr() : "";
  const stdout = typeof command.stdout === "function" ? await command.stdout() : "";
  return new Error(`${label} failed: ${(stderr || stdout || `exit ${command.exitCode}`).trim().slice(0, 600)}`);
}

async function waitForPreview(previewUrl, options = {}) {
  const fetchFn = options.fetchFn ?? fetch;
  const delayFn = options.delayFn ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const attempts = options.attempts ?? 20;
  let lastStatus = null;
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchFn(previewUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(1_000),
      });
      lastStatus = response.status ?? null;
      if (response.ok) {
        await response.body?.cancel?.().catch?.(() => {});
        return;
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1) await delayFn(250);
  }

  const detail = lastStatus ? `HTTP ${lastStatus}` : lastError?.message ?? "no response";
  throw new Error(`Sandbox preview did not become ready: ${detail}`);
}

export async function composeArtWithCode(body, options = {}) {
  const { prompt } = validateComposeRequest(body);
  const generateTextFn = options.generateTextFn ?? generateText;
  const SandboxClass = options.SandboxClass ?? Sandbox;
  const requestedModel = typeof body.model === "string" ? body.model.trim() : "";
  if (requestedModel && !isComparisonModel(requestedModel)) {
    throw new TypeError("The selected code model is not supported.");
  }
  const modelId = options.modelId ?? (requestedModel || process.env.SANDBOX_CODE_MODEL || DEFAULT_COMPARISON_MODEL);
  const startedAt = performance.now();
  const generationStartedAt = performance.now();
  const result = await generateTextFn({
    model: options.model ?? modelId,
    output: Output.object({
      name: "generatedCanvasArtwork",
      description: "A title and complete self-contained Canvas 2D JavaScript artwork.",
      schema: generatedArtworkSchema,
    }),
    system: `You are an expert generative artist writing a complete browser Canvas 2D artwork.

Create the most specific visual interpretation of the request. This route is intentionally freeform: do not emit an ArtSpec and do not constrain the work to a fixed visual grammar.

Runtime contract:
- Return a short title and plain JavaScript in the code field. Never include Markdown fences.
- A full-viewport <canvas id="art"> already exists. Acquire its 2D context and draw the artwork.
- Resize for the viewport and devicePixelRatio. Redraw on resize.
- Animation with requestAnimationFrame is allowed when it supports the prompt.
- Use only built-in browser Canvas 2D APIs. No imports, packages, network calls, external assets, workers, storage, cookies, parent-window access, eval, or Function constructors.
- Keep the implementation under 60,000 characters and make it robust in a modern browser.
- Avoid generic particle defaults. Composition, palette, form, texture, lighting, and motion should all respond directly to the request.`,
    prompt: `Create this artwork: ${JSON.stringify(prompt)}`,
  });
  if (!result.output || typeof result.output !== "object") {
    throw new TypeError("The code model returned no artwork.");
  }
  const title = typeof result.output.title === "string" ? result.output.title.trim() : "Generated artwork";
  const code = validateGeneratedCode(result.output.code);
  const generationLatencyMs = Math.round(performance.now() - generationStartedAt);
  const resolvedModel = result.response?.modelId ?? modelId;
  const generationReceipt = createAIReceipt(result, {
    model: resolvedModel,
    latencyMs: generationLatencyMs,
    stage: "model-code",
  });

  let sandbox = null;
  const sandboxStartedAt = performance.now();
  try {
    sandbox = await SandboxClass.create({
      image: "vercel/sandbox/universal:latest",
      persistent: false,
      timeout: options.sandboxTimeoutMs ?? SANDBOX_TIMEOUT_MS,
      ports: [PREVIEW_PORT],
      networkPolicy: "deny-all",
      tags: { purpose: "decision-canvas-preview" },
    });
    await sandbox.writeFiles([
      { path: "index.html", content: previewHtml(title) },
      { path: "sketch.js", content: code },
      { path: "validate.mjs", content: VALIDATOR_SOURCE },
      { path: "server.mjs", content: SERVER_SOURCE },
    ]);
    const syntax = await sandbox.runCommand("node", ["--check", "sketch.js"], { timeoutMs: 5_000 });
    const syntaxError = await commandError(syntax, "JavaScript syntax check");
    if (syntaxError) throw syntaxError;
    const validation = await sandbox.runCommand("node", ["validate.mjs"], { timeoutMs: 5_000 });
    const validationError = await commandError(validation, "Sandbox execution");
    if (validationError) throw validationError;
    await sandbox.runCommand({ cmd: "node", args: ["server.mjs"], detached: true });
    const previewUrl = sandbox.domain(PREVIEW_PORT);
    await waitForPreview(previewUrl, {
      fetchFn: options.fetchFn,
      delayFn: options.delayFn,
      attempts: options.previewAttempts,
    });

    const sandboxLatencyMs = Math.round(performance.now() - sandboxStartedAt);
    const sandboxReceipt = {
      stage: "sandbox-execution",
      model: "vercel/sandbox",
      latencyMs: sandboxLatencyMs,
      tokens: { input: null, output: null, total: null },
      costUsd: null,
    };
    return {
      source: "sandbox-code",
      mode: "code",
      model: resolvedModel,
      title,
      code,
      previewUrl,
      sandboxId: sandbox.name,
      expiresInMs: options.sandboxTimeoutMs ?? SANDBOX_TIMEOUT_MS,
      latencyMs: Math.round(performance.now() - startedAt),
      receipts: [generationReceipt, sandboxReceipt],
      receipt: sandboxReceipt,
      trace: {
        mode: "code-sandbox",
        generationLatencyMs,
        sandboxLatencyMs,
        checks: ["static policy", "syntax", "runtime smoke test", "public preview ready"],
      },
    };
  } catch (error) {
    if (sandbox) await sandbox.stop().catch(() => {});
    if (isMissingSandboxAuth(error) && error && typeof error === "object") {
      error.code = "MISSING_SANDBOX_AUTH";
    }
    throw error;
  }
}

export function isMissingSandboxAuth(error) {
  const message = error instanceof Error ? error.message : String(error);
  return error?.code === "MISSING_SANDBOX_AUTH" || message.includes("VERCEL_OIDC_TOKEN") || message.includes("VERCEL_TOKEN") || /sandbox.+auth|auth.+sandbox/i.test(message);
}
