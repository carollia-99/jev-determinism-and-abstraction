import { createInterpretResponse } from "../server/interpret-with-jev.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
  }

  const result = await createInterpretResponse(request.body);
  return response.status(result.status).json(result.body);
}
