import { describe, expect, it } from "vitest";

import { validateAuthInput, validateUserName } from "./options";

describe("authentication input validation", () => {
  it("requires the email/password policy for sign-up", () => {
    expect(
      validateAuthInput("sign-up", {
        name: "",
        email: "not-an-email",
        password: "short",
      }),
    ).toEqual({ name: "name", email: "email", password: "password" });
  });

  it("does not require a name for sign-in", () => {
    expect(
      validateAuthInput("sign-in", {
        name: "",
        email: "creator@example.com",
        password: "correct-password",
      }),
    ).toEqual({});
  });

  it("rejects a blank email/password sign-up name on the server boundary", () => {
    expect(
      validateUserName(
        { name: "   " },
        { action: "create-user", method: "email-password" },
      ),
    ).toEqual({ error: "INVALID_NAME" });
  });
});
