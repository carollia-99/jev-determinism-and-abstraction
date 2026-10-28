import { describe, expect, it, vi } from "vitest";
import { composeArtWithCode } from "../server/compose-with-code.js";

function generatedResult(code = "const canvas = document.getElementById('art'); const context = canvas.getContext('2d'); context.fillRect(0, 0, 10, 10);") {
  return {
    output: { title: "Living glass", code },
    response: { modelId: "anthropic/claude-sonnet-4.6" },
    usage: { inputTokens: 20, outputTokens: 80, totalTokens: 100 },
    providerMetadata: { gateway: { cost: "0.0012" } },
  };
}

function sandboxHarness({ validationExitCode = 0 } = {}) {
  const sandbox = {
    name: "sbx_test",
    writeFiles: vi.fn(async () => {}),
    runCommand: vi.fn(async (...args) => {
      if (typeof args[0] === "object") return { exitCode: null };
      const isValidation = args[1]?.[0] === "validate.mjs";
      return {
        exitCode: isValidation ? validationExitCode : 0,
        stderr: async () => isValidation && validationExitCode ? "render exploded" : "",
        stdout: async () => "",
      };
    }),
    domain: vi.fn(() => "https://preview.vercel.run"),
    stop: vi.fn(async () => {}),
  };
  return {
    sandbox,
    SandboxClass: { create: vi.fn(async () => sandbox) },
  };
}

describe("code and Sandbox composition", () => {
  it("generates JavaScript, validates it, and returns an isolated preview", async () => {
    const generateTextFn = vi.fn(async () => generatedResult());
    const { sandbox, SandboxClass } = sandboxHarness();
    const onProgress = vi.fn();
    const result = await composeArtWithCode(
      { prompt: "living stained glass", model: "openai/gpt-5.4" },
      { generateTextFn, SandboxClass, sandboxTimeoutMs: 60_000, fetchFn: async () => ({ ok: true, status: 200 }), onProgress },
    );

    expect(result).toMatchObject({
      source: "sandbox-code",
      mode: "code",
      title: "Living glass",
      previewUrl: "https://preview.vercel.run",
      sandboxId: "sbx_test",
      expiresInMs: 60_000,
    });
    expect(result.receipts).toEqual([
      expect.objectContaining({ stage: "model-code", model: "anthropic/claude-sonnet-4.6", costUsd: 0.0012 }),
      expect.objectContaining({ stage: "sandbox-execution", model: "vercel/sandbox", costUsd: null }),
    ]);
    expect(generateTextFn).toHaveBeenCalledWith(expect.objectContaining({ model: "anthropic/claude-sonnet-4.6" }));
    expect(SandboxClass.create).toHaveBeenCalledWith(expect.objectContaining({
      networkPolicy: "deny-all",
      persistent: false,
      ports: [4173],
    }));
    expect(sandbox.writeFiles).toHaveBeenCalledOnce();
    expect(sandbox.writeFiles.mock.calls[0][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "bridge.js", content: expect.stringContaining("decision-canvas:download") }),
    ]));
    expect(sandbox.runCommand).toHaveBeenCalledTimes(3);
    expect(sandbox.stop).not.toHaveBeenCalled();
    expect(onProgress.mock.calls.map(([progress]) => progress.stage)).toEqual([
      "code-generation",
      "code-generation",
      "sandbox-create",
      "sandbox-create",
      "syntax-check",
      "runtime-check",
      "preview-start",
      "preview-ready",
    ]);
  });

  it("stops the Sandbox when generated code fails its runtime smoke test", async () => {
    const { sandbox, SandboxClass } = sandboxHarness({ validationExitCode: 1 });
    await expect(composeArtWithCode(
      { prompt: "broken art" },
      { generateTextFn: async () => generatedResult(), SandboxClass, fetchFn: async () => ({ ok: true, status: 200 }) },
    )).rejects.toThrow("Sandbox execution failed");
    expect(sandbox.stop).toHaveBeenCalledOnce();
  });

  it("rejects network-capable generated code before creating a Sandbox", async () => {
    const { SandboxClass } = sandboxHarness();
    await expect(composeArtWithCode(
      { prompt: "remote art" },
      { generateTextFn: async () => generatedResult("fetch('https://example.com')"), SandboxClass },
    )).rejects.toThrow("network APIs");
    expect(SandboxClass.create).not.toHaveBeenCalled();
  });

  it("allows ordinary geometry variables named top and parent", async () => {
    const code = "const top = 12; const parent = { width: 20 }; const canvas = document.getElementById('art'); canvas.getContext('2d').fillRect(0, top, parent.width, 10);";
    const { SandboxClass } = sandboxHarness();
    await expect(composeArtWithCode(
      { prompt: "stacked geometry" },
      { generateTextFn: async () => generatedResult(code), SandboxClass, fetchFn: async () => ({ ok: true, status: 200 }) },
    )).resolves.toMatchObject({ mode: "code" });
  });

  it.each([
    "window.parent.postMessage('x', '*')",
    "globalThis['top'].location = 'https://example.com'",
    "parent.document.body.textContent = 'x'",
  ])("rejects actual parent-window traversal: %s", async (code) => {
    const { SandboxClass } = sandboxHarness();
    await expect(composeArtWithCode(
      { prompt: "escape frame" },
      { generateTextFn: async () => generatedResult(code), SandboxClass },
    )).rejects.toThrow("parent-window access");
    expect(SandboxClass.create).not.toHaveBeenCalled();
  });

  it("waits for the public route and stops a Sandbox that never listens", async () => {
    const { sandbox, SandboxClass } = sandboxHarness();
    const fetchFn = vi.fn(async () => ({ ok: false, status: 502 }));
    await expect(composeArtWithCode(
      { prompt: "silent preview" },
      {
        generateTextFn: async () => generatedResult(),
        SandboxClass,
        fetchFn,
        delayFn: async () => {},
        previewAttempts: 2,
      },
    )).rejects.toThrow("Sandbox preview did not become ready: HTTP 502");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sandbox.stop).toHaveBeenCalledOnce();
  });
});
