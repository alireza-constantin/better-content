import { describe, expect, it } from "vitest";

import { getAuthOriginConfiguration } from "./origin";

describe("Better Auth origin configuration", () => {
  it("uses the configured application origin as the only trusted browser origin", () => {
    expect(getAuthOriginConfiguration("http://localhost:3000")).toEqual({
      baseURL: "http://localhost:3000",
      trustedOrigins: ["http://localhost:3000"],
      advanced: {
        disableCSRFCheck: false,
        disableOriginCheck: false,
      },
    });
  });
});
