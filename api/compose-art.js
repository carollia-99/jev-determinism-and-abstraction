import { createComposeResponse } from "../server/compose-art.js";
import { streamComposeArt } from "../server/compose-stream.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
  }
  if (String(request.headers.accept ?? "").includes("application/x-ndjson")) {
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();
    await streamComposeArt(request.body, (event) => response.write(`${JSON.stringify(event)}\n`));
    return response.end();
  }
  const result = await createComposeResponse(request.body);
  return response.status(result.status).json(result.body);
}
