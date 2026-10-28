import { composeArt, createComposeErrorResponse } from "./compose-art.js";

export async function streamComposeArt(body, send) {
  try {
    const result = await composeArt(body, {
      onProgress: (progress) => send({ type: "progress", progress }),
    });
    send({ type: "result", body: result });
  } catch (error) {
    const mode = ["jev", "model", "code"].includes(body?.mode) ? body.mode : "jev";
    console.error(`${mode} art composition stream failed`, error);
    const result = createComposeErrorResponse(error, mode);
    send({ type: "error", status: result.status, body: result.body });
  }
}
