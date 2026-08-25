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

  it("limits errors to the approved Phase 1 categories", () => {
    expect(applicationErrorCodes).toEqual([
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "VALIDATION_ERROR",
      "CONFLICT",
      "INTERNAL_ERROR",
    ]);
  });
});
