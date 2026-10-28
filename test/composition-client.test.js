import { describe, expect, it, vi } from "vitest";
import { requestArtComposition } from "../src/composition-client.js";

describe("composition client", () => {
  it("posts the art prompt", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ decisionCount: 80 }) }));
    const result = await requestArtComposition("quiet geometry", fetchFn);
    expect(result.decisionCount).toBe(80);
    expect(fetchFn).toHaveBeenCalledWith("/api/compose-art", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ prompt: "quiet geometry" });
  });

  it("preserves structured server errors", async () => {
    const fetchFn = async () => ({ ok: false, json: async () => ({ error: "No key", code: "MISSING_AI_GATEWAY_AUTH" }) });
    await expect(requestArtComposition("test", fetchFn)).rejects.toMatchObject({ code: "MISSING_AI_GATEWAY_AUTH" });
  });
});
