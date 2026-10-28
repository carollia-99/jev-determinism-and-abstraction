import { afterEach, describe, expect, it } from "vitest";
import {
  clearSessionHistory,
  getSessionHistory,
  getRequestTotals,
  getSessionTotals,
  recordSessionRequest,
} from "../src/session-history.js";

afterEach(clearSessionHistory);

describe("session history", () => {
  it("groups decision and generation receipts under one prompt", () => {
    recordSessionRequest({
      prompt: "move like jellyfish",
      outcome: "generated",
      steps: [
        { stage: "decision", latencyMs: 205, tokens: { total: 90 }, costUsd: 0.00001 },
        { stage: "generation", latencyMs: 8120, tokens: { total: 410 }, costUsd: 0.0025 },
      ],
    });

    expect(getSessionHistory()).toHaveLength(1);
    expect(getSessionHistory()[0].steps).toHaveLength(2);
    expect(getRequestTotals(getSessionHistory()[0])).toMatchObject({
      calls: 2,
      latencyMs: 8325,
      costUsd: 0.00251,
    });
    expect(getSessionTotals()).toEqual({
      calls: 2,
      latencyMs: 8325,
      tokens: 500,
      tokenizedCalls: 2,
      costUsd: 0.00251,
      pricedCalls: 2,
    });
  });

  it("tracks partial receipts without inventing missing cost", () => {
    recordSessionRequest({
      prompt: "calm",
      outcome: "applied",
      steps: [{ stage: "decision", latencyMs: 110, tokens: { total: null }, costUsd: null }],
    });
    expect(getSessionTotals()).toMatchObject({ calls: 1, latencyMs: 110, tokenizedCalls: 0, pricedCalls: 0 });
  });

  it("preserves the route and selected model on the request receipt", () => {
    recordSessionRequest({
      prompt: "green blue gradient",
      source: "model-art",
      model: "openai/gpt-5.4-mini",
      outcome: "applied",
      steps: [],
    });

    expect(getSessionHistory()[0]).toMatchObject({
      source: "model-art",
      model: "openai/gpt-5.4-mini",
    });
  });
});
