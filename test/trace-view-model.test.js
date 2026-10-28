import { describe, expect, it } from "vitest";
import { buildTraceViewModel } from "../src/ui.js";

const state = { motion: "JITTER", speed: "HIGH", energy: "HIGH" };

describe("model trace view model", () => {
  it("exposes Jev model, latency, decisions, and confidence", () => {
    const trace = buildTraceViewModel({
      source: "jev",
      state,
      model: "typesafe-ai/jev-1.14.0",
      latencyMs: 141,
      capability: { sufficient: true, confidence: 0.94 },
      decisions: {
        motion: { choice: "JITTER", confidence: 0.923 },
        speed: { choice: "HIGH", confidence: 0.88 },
        energy: { choice: "HIGH", confidence: null },
      },
    });

    expect(trace.sourceLabel).toBe("Jev");
    expect(trace.meta).toBe("typesafe-ai/jev-1.14.0 · 141 ms");
    expect(trace.capability).toEqual({ status: "existing", verdict: "Existing", confidence: 0.94 });
    expect(trace.rows).toEqual([
      { dimension: "motion", choice: "JITTER", confidence: 0.923 },
      { dimension: "speed", choice: "HIGH", confidence: 0.88 },
      { dimension: "energy", choice: "HIGH", confidence: null },
    ]);
  });

  it("suppresses unapplied choices when Jev requests escalation", () => {
    const trace = buildTraceViewModel({
      source: "jev",
      state,
      model: "typesafe-ai/jev-1.14.0",
      latencyMs: 120,
      capability: { sufficient: false, confidence: 0.91 },
      decisions: {
        motion: { choice: "ORBIT", confidence: 0.52 },
        speed: { choice: "HIGH", confidence: 0.7 },
        energy: { choice: "HIGH", confidence: 0.8 },
      },
    });

    expect(trace.capability).toEqual({ status: "missing", verdict: "New required", confidence: 0.91 });
    expect(trace.rows.every((row) => row.choice === "—" && row.confidence === null)).toBe(true);
  });

  it("clearly distinguishes fallback and manual states without invented confidence", () => {
    expect(buildTraceViewModel({ source: "local", state }).sourceLabel).toBe("Local fallback");
    expect(buildTraceViewModel({ source: "manual", state }).rows.every((row) => row.confidence === null)).toBe(
      true,
    );
  });

  it("labels a Jev-only session capability reuse", () => {
    const trace = buildTraceViewModel({
      source: "jev",
      state: { motion: "JELLYFISH", speed: "LOW", energy: "LOW" },
      capability: { sufficient: true, confidence: 0.96, action: "reuse_session" },
    });

    expect(trace.capability).toEqual({ status: "session", verdict: "Session reuse", confidence: 0.96 });
    expect(trace.rows[0].choice).toBe("JELLYFISH");
  });
});
