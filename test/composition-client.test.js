import { describe, expect, it, vi } from "vitest";
import { requestArtComposition } from "../src/composition-client.js";

describe("composition client", () => {
  it("sends the selected image model for direct image generation", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ mode: "image", image: { dataUrl: "data:image/png;base64,aA==" } }),
    });

    await requestArtComposition(
      "yellow light",
      { mode: "image", model: "recraft/recraft-v4.1-flash" },
      fetchFn,
    );

    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({
      prompt: "yellow light",
      mode: "image",
      model: "recraft/recraft-v4.1-flash",
    });
  });

  it("posts the art prompt", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ decisionCount: 80 }) }));
    const result = await requestArtComposition("quiet geometry", fetchFn);
    expect(result.decisionCount).toBe(80);
    expect(fetchFn).toHaveBeenCalledWith("/api/compose-art", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ prompt: "quiet geometry", mode: "jev" });
  });

  it("selects the full-model composition route", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ mode: "model" }) }));
    const result = await requestArtComposition(
      "quiet geometry",
      { mode: "model", model: "openai/gpt-5.4-mini" },
      fetchFn,
    );
    expect(result.mode).toBe("model");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({
      prompt: "quiet geometry",
      mode: "model",
      model: "openai/gpt-5.4-mini",
    });
  });

  it("marks Jev live-preview requests without changing composition mode", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ mode: "jev" }) }));
    await requestArtComposition("green blue", { mode: "jev", live: true }, fetchFn);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({
      prompt: "green blue",
      mode: "jev",
      live: true,
    });
  });

  it("selects the fixed-model custom code and Sandbox route", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ mode: "code" }) }));
    const result = await requestArtComposition(
      "living stained glass",
      { mode: "code", model: "anthropic/claude-haiku-4.5" },
      fetchFn,
    );
    expect(result.mode).toBe("code");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({
      prompt: "living stained glass",
      mode: "code",
    });
  });

  it("preserves structured server errors", async () => {
    const fetchFn = async () => ({ ok: false, json: async () => ({ error: "No key", code: "MISSING_AI_GATEWAY_AUTH" }) });
    await expect(requestArtComposition("test", fetchFn)).rejects.toMatchObject({ code: "MISSING_AI_GATEWAY_AUTH" });
  });

  it("reports live progress before returning the streamed composition", async () => {
    const encoder = new TextEncoder();
    const events = [
      { type: "progress", progress: { stage: "route-check", message: "Checking fit" } },
      { type: "progress", progress: { stage: "code-generation", message: "Writing code" } },
      { type: "result", body: { mode: "code", title: "Subway" } },
    ];
    const body = new ReadableStream({
      start(controller) {
        events.forEach((event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)));
        controller.close();
      },
    });
    const fetchFn = vi.fn(async () => ({
      ok: true,
      headers: { get: () => "application/x-ndjson; charset=utf-8" },
      body,
    }));
    const onProgress = vi.fn();
    const result = await requestArtComposition("interactive subway", { mode: "jev", onProgress }, fetchFn);

    expect(onProgress.mock.calls.map(([progress]) => progress.stage)).toEqual(["route-check", "code-generation"]);
    expect(result).toEqual({ mode: "code", title: "Subway" });
    expect(fetchFn.mock.calls[0][1].headers.Accept).toBe("application/x-ndjson");
  });

  it("preserves the failure detail and last live stage from a streamed composition", async () => {
    const encoder = new TextEncoder();
    const events = [
      { type: "progress", progress: { stage: "runtime-check", message: "Validating code" } },
      { type: "error", body: { error: "The model or Sandbox could not build this artwork.", code: "CODE_COMPOSITION_FAILED", detail: "Sandbox execution failed: arcTo is not defined" } },
    ];
    const body = new ReadableStream({
      start(controller) {
        events.forEach((event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)));
        controller.close();
      },
    });
    const fetchFn = async () => ({
      ok: true,
      headers: { get: () => "application/x-ndjson; charset=utf-8" },
      body,
    });

    await expect(requestArtComposition("test", { mode: "code", onProgress() {} }, fetchFn)).rejects.toMatchObject({
      code: "CODE_COMPOSITION_FAILED",
      detail: "Sandbox execution failed: arcTo is not defined",
      stage: "runtime-check",
    });
  });
});
