import { describe, expect, it, vi } from "vitest";
import { composeArt } from "../server/compose-art.js";

const routeReceipt = {
  stage: "composition-route",
  model: "typesafe-ai/jev-test",
  latencyMs: 12,
  tokens: { total: 8 },
  costUsd: 0.00001,
};

describe("automatic Jev handoff", () => {
  it("routes direct image generation without invoking Jev", async () => {
    const composeImage = vi.fn(async () => ({ mode: "image", source: "image-generation" }));
    const routeJev = vi.fn();
    const result = await composeArt(
      { prompt: "a luminous portrait", mode: "image", model: "openai/gpt-image-2.5-flare" },
      { composeImage, routeJev },
    );

    expect(result).toEqual({ mode: "image", source: "image-generation" });
    expect(composeImage).toHaveBeenCalledOnce();
    expect(routeJev).not.toHaveBeenCalled();
  });

  it("uses Jev directly for live previews without running the route check", async () => {
    const routeJev = vi.fn();
    const composeJev = vi.fn(async () => ({ mode: "jev", source: "jev-art" }));
    const result = await composeArt(
      { prompt: "green blue", mode: "jev", live: true },
      { routeJev, composeJev },
    );

    expect(result).toEqual({ mode: "jev", source: "jev-art" });
    expect(composeJev).toHaveBeenCalledOnce();
    expect(routeJev).not.toHaveBeenCalled();
  });

  it("hands a custom route to code and preserves the full receipt chain", async () => {
    const onProgress = vi.fn();
    const composeCode = vi.fn(async () => ({
      source: "sandbox-code",
      mode: "code",
      model: "anthropic/claude-sonnet-4.6",
      latencyMs: 100,
      receipts: [{ stage: "model-code" }, { stage: "sandbox-execution" }],
      trace: { checks: [] },
    }));
    const result = await composeArt(
      { prompt: "draw an interactive clock", mode: "jev" },
      {
        routeJev: async () => ({
          route: "CUSTOM_CODE",
          requestedRoute: "CUSTOM_CODE",
          confidence: 0.9,
          threshold: 0.65,
          model: "typesafe-ai/jev-test",
          latencyMs: 12,
          receipt: routeReceipt,
        }),
        composeCode,
        composeJev: vi.fn(),
        onProgress,
      },
    );

    expect(composeCode).toHaveBeenCalledOnce();
    expect(result.latencyMs).toBe(112);
    expect(result.receipts.map((receipt) => receipt.stage)).toEqual([
      "composition-route",
      "model-code",
      "sandbox-execution",
    ]);
    expect(result.autoRoute).toMatchObject({ selected: "CUSTOM_CODE", confidence: 0.9 });
    expect(onProgress.mock.calls.slice(0, 2).map(([progress]) => [progress.stage, progress.status])).toEqual([
      ["route-check", "running"],
      ["route-check", "complete"],
    ]);
  });

  it("continues through Jev when the spec is expressive enough", async () => {
    const composeJev = vi.fn(async () => ({
      source: "jev-art",
      model: "typesafe-ai/jev-test",
      latencyMs: 80,
      receipts: [{ stage: "thesis" }, { stage: "composition" }],
      trace: { tier1: {}, tier2: {} },
    }));
    const result = await composeArt(
      { prompt: "green blue gradient", mode: "jev" },
      {
        routeJev: async () => ({
          route: "POPULATE_SPEC",
          requestedRoute: "POPULATE_SPEC",
          confidence: 0.94,
          threshold: 0.65,
          model: "typesafe-ai/jev-test",
          latencyMs: 12,
          receipt: routeReceipt,
        }),
        composeCode: vi.fn(),
        composeJev,
      },
    );

    expect(composeJev).toHaveBeenCalledOnce();
    expect(result.trace.gate.route).toBe("POPULATE_SPEC");
    expect(result.receipts[0].stage).toBe("composition-route");
  });
});
