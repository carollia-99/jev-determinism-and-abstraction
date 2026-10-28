import { defineConfig, loadEnv } from "vite";
import { createInterpretResponse } from "./server/interpret-with-jev.js";
import { createCapabilityResponse } from "./server/generate-capability.js";
import { createComposeResponse } from "./server/compose-art.js";

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 16_384) reject(new TypeError("Request body is too large."));
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new TypeError("Request body must contain valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function localInterpretApi() {
  return {
    name: "local-ai-api",
    configureServer(server) {
      server.middlewares.use("/api/interpret", async (request, response, next) => {
        if (request.method !== "POST") return next();

        try {
          const result = await createInterpretResponse(await readJsonBody(request));
          response.statusCode = result.status;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(result.body));
        } catch (error) {
          response.statusCode = 400;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: error.message, code: "INVALID_REQUEST" }));
        }
      });

      server.middlewares.use("/api/generate-capability", async (request, response, next) => {
        if (request.method !== "POST") return next();

        try {
          const result = await createCapabilityResponse(await readJsonBody(request));
          response.statusCode = result.status;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(result.body));
        } catch (error) {
          response.statusCode = 400;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: error.message, code: "INVALID_REQUEST" }));
        }
      });

      server.middlewares.use("/api/compose-art", async (request, response, next) => {
        if (request.method !== "POST") return next();

        try {
          const result = await createComposeResponse(await readJsonBody(request));
          response.statusCode = result.status;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(result.body));
        } catch (error) {
          response.statusCode = 400;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: error.message, code: "INVALID_REQUEST" }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const name of ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "JEV_MODEL", "CAPABILITY_MODEL", "COMPARISON_MODEL"]) {
    if (!process.env[name] && env[name]) process.env[name] = env[name];
  }

  return { plugins: [localInterpretApi()] };
});
