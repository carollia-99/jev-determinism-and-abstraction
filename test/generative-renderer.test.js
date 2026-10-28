import { describe, expect, it, vi } from "vitest";
import { createDefaultArtSpec } from "../shared/art-grammar.js";
import { ART_COLORS, drawBackground, resolveArtColor } from "../src/generative-renderer.js";

describe("literal art field rendering", () => {
  it("maps named colors to stable literal values", () => {
    expect(resolveArtColor("RED")).toBe(ART_COLORS.RED);
    expect(resolveArtColor("YELLOW")).toBe(ART_COLORS.YELLOW);
    expect(resolveArtColor("UNKNOWN")).toBe(ART_COLORS.BLACK);
  });

  it("renders an explicit red to yellow gradient without palette substitution", () => {
    const gradient = { addColorStop: vi.fn() };
    const context = {
      createLinearGradient: vi.fn(() => gradient),
      createRadialGradient: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: "",
    };
    const spec = {
      ...createDefaultArtSpec(),
      background: "CREAM",
      fieldTreatment: "GRADIENT",
      frameTreatment: "INSET_SMALL",
      gradient: "LINEAR",
      gradientDirection: "LEFT_TO_RIGHT",
      gradientStartColor: "RED",
      gradientEndColor: "YELLOW",
    };

    drawBackground(context, 400, 200, spec);

    expect(context.createLinearGradient).toHaveBeenCalledWith(6, 100, 394, 100);
    expect(gradient.addColorStop).toHaveBeenNthCalledWith(1, 0, ART_COLORS.RED);
    expect(gradient.addColorStop).toHaveBeenNthCalledWith(2, 1, ART_COLORS.YELLOW);
    expect(context.fillRect).toHaveBeenLastCalledWith(6, 6, 388, 188);
  });
});
