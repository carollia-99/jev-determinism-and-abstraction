import { afterEach, describe, expect, it, vi } from "vitest";
import { getArtSpec, resetArtSpec, subscribeToArtSpec, updateArtSpec } from "../src/art-spec-state.js";

afterEach(() => resetArtSpec());

describe("art spec state", () => {
  it("publishes complete four-layer specifications", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToArtSpec(listener);
    const next = { ...getArtSpec(), atmosphere: "SUBLIME", layers: getArtSpec().layers.map((layer) => ({ ...layer })) };
    updateArtSpec(next);
    expect(getArtSpec().atmosphere).toBe("SUBLIME");
    expect(listener).toHaveBeenCalledWith(next);
    unsubscribe();
  });

  it("rejects incomplete specifications", () => {
    expect(() => updateArtSpec({ layers: [] })).toThrow("invalid");
  });
});
