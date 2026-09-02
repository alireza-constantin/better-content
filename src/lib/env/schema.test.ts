import { describe, expect, it } from "vitest";

import { parseOpenAIEnvironment, parseServerEnvironment } from "./schema";

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
    expect(() =>
      parseServerEnvironment({ ...validEnvironment, DATABASE_URL: undefined }),
    ).toThrow();
  });

  it("requires Better Auth to use an application origin", () => {
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        BETTER_AUTH_URL: "http://localhost:3000/api/auth",
      }),
    ).toThrow("Expected an HTTP(S) application origin");
  });

  it("rejects server secrets exposed through NEXT_PUBLIC_ variables", () => {
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_DATABASE_URL: validEnvironment.DATABASE_URL,
      }),
    ).toThrow("DATABASE_URL must not be exposed");
  });

  it("validates OpenAI credentials separately from the base server environment", () => {
    expect(
      parseOpenAIEnvironment({
        OPENAI_API_KEY: "sk-test-only",
        AI_SAFETY_IDENTIFIER_SECRET: "a-test-only-safety-secret-that-is-long-enough",
      }),
    ).toEqual({
      OPENAI_API_KEY: "sk-test-only",
      AI_SAFETY_IDENTIFIER_SECRET: "a-test-only-safety-secret-that-is-long-enough",
    });

    expect(() => parseOpenAIEnvironment({ OPENAI_API_KEY: "sk-test-only" })).toThrow();
  });

  it("rejects OpenAI secrets exposed through NEXT_PUBLIC_ variables", () => {
    expect(() =>
      parseOpenAIEnvironment({
        OPENAI_API_KEY: "sk-test-only",
        AI_SAFETY_IDENTIFIER_SECRET: "a-test-only-safety-secret-that-is-long-enough",
        NEXT_PUBLIC_OPENAI_API_KEY: "sk-test-only",
      }),
    ).toThrow("OPENAI_API_KEY must not be exposed");

    expect(() =>
      parseOpenAIEnvironment({
        OPENAI_API_KEY: "sk-test-only",
        AI_SAFETY_IDENTIFIER_SECRET: "a-test-only-safety-secret-that-is-long-enough",
        NEXT_PUBLIC_AI_SAFETY_IDENTIFIER_SECRET: "unsafe",
      }),
    ).toThrow("AI_SAFETY_IDENTIFIER_SECRET must not be exposed");
  });
});
