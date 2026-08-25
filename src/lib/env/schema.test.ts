import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "./schema";

const validEnvironment = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/better_content",
  BETTER_AUTH_SECRET: "a-test-only-secret-that-is-long-enough",
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("server environment validation", () => {
  it("accepts required server-only configuration", () => {
    expect(parseServerEnvironment(validEnvironment)).toEqual(validEnvironment);
  });

  it("rejects missing required configuration", () => {
    expect(() => parseServerEnvironment({ ...validEnvironment, DATABASE_URL: undefined })).toThrow();
  });

  it("rejects server secrets exposed through NEXT_PUBLIC_ variables", () => {
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_DATABASE_URL: validEnvironment.DATABASE_URL,
      }),
    ).toThrow("DATABASE_URL must not be exposed");
  });
});
