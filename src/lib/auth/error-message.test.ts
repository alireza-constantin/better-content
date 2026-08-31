import { describe, expect, it } from "vitest";

import { getAuthenticationErrorMessage } from "./error-message";

describe("authentication error messages", () => {
  it("maps Better Auth codes to safe localized message keys", () => {
    expect(
      getAuthenticationErrorMessage("sign-up", { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" }),
    ).toBe("accountExists");
    expect(getAuthenticationErrorMessage("sign-in", { code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "invalidCredentials",
    );
  });

  it("does not expose unknown provider or database errors", () => {
    expect(getAuthenticationErrorMessage("sign-up", { code: "DATABASE_CONNECTION_FAILED" })).toBe(
      "generic",
    );
    expect(getAuthenticationErrorMessage("sign-in", new Error("password leaked"))).toBe(
      "invalidCredentials",
    );
  });
});
