import { describe, expect, it } from "vitest";

import { ApplicationError, applicationErrorCodes } from "./app-error";

describe("ApplicationError", () => {
  it("uses stable codes with appropriate HTTP statuses", () => {
    expect(new ApplicationError("FORBIDDEN", "Access denied")).toMatchObject({
      name: "ApplicationError",
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("contains the stable application error vocabulary through Phase 3", () => {
    expect(applicationErrorCodes).toEqual([
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "VALIDATION_ERROR",
      "CONFLICT",
      "RATE_LIMITED",
      "PROVIDER_ERROR",
      "AI_OUTPUT_INVALID",
      "INTERNAL_ERROR",
    ]);
  });

  it("maps Phase 3 operational errors to safe transport statuses", () => {
    expect(new ApplicationError("RATE_LIMITED", "Try again later.").status).toBe(429);
    expect(new ApplicationError("PROVIDER_ERROR", "The provider failed.").status).toBe(502);
    expect(new ApplicationError("AI_OUTPUT_INVALID", "The result was invalid.").status).toBe(502);
  });
});
