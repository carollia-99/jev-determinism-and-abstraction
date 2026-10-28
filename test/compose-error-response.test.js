import { describe, expect, it } from "vitest";
import { createComposeErrorResponse } from "../server/compose-art.js";

describe("compose error responses", () => {
  it("returns a safe generated-code validation detail", () => {
    const response = createComposeErrorResponse(
      new TypeError("The generated JavaScript attempted to use parent-window access."),
      "code",
    );

    expect(response).toEqual({
      status: 400,
      body: {
        error: "The generated JavaScript attempted to use parent-window access.",
        code: "INVALID_REQUEST",
      },
    });
  });

  it("returns a safe Sandbox execution detail", () => {
    const response = createComposeErrorResponse(
      new Error("Sandbox execution failed: arcTo is not defined"),
      "code",
    );

    expect(response.body).toMatchObject({
      code: "CODE_COMPOSITION_FAILED",
      detail: "Sandbox execution failed: arcTo is not defined",
    });
  });

  it("does not expose unknown upstream error text", () => {
    const response = createComposeErrorResponse(new Error("upstream secret detail"), "code");
    expect(response.body).not.toHaveProperty("detail");
  });
});
