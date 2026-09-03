import { describe, expect, it } from "vitest";

import {
  parseGenerateContentScriptRequest,
  parseGenerateContentScriptResult,
  type GenerateContentScriptRequest,
} from "@/modules/ai/domain/generate-content-script";

import { FakeGenerateContentScriptProvider } from "./fake-generate-content-script-provider";

function request(overrides: Record<string, unknown> = {}): GenerateContentScriptRequest {
  return {
    generationKind: "CONTENT_SCRIPT_GENERATION",
    sourceIdea: {
      title: "A useful idea",
      description: "A concise creator-facing explanation.",
      category: "Education",
    },
    contentDna: { schemaVersion: 1 },
    requestedLanguage: "en",
    format: "SHORT_VIDEO",
    instructions: "Use a direct opening.",
    ...overrides,
  } as GenerateContentScriptRequest;
}

describe("GenerateContentScriptProvider contract", () => {
  it("accepts only canonical prompt facts without provider configuration or identity", () => {
    expect(parseGenerateContentScriptRequest(request())).toEqual(request());

    for (const field of [
      "safetyIdentifier",
      "hmac",
      "userId",
      "provider",
      "model",
      "endpoint",
      "timeout",
      "maxOutputTokens",
      "serviceTier",
      "promptCacheSettings",
    ]) {
      expect(() =>
        parseGenerateContentScriptRequest({ ...request(), [field]: "excluded" }),
      ).toThrow();
    }

    expect(() =>
      parseGenerateContentScriptRequest(request({ instructions: "  not canonical  " })),
    ).toThrow();

    expect(
      parseGenerateContentScriptRequest(
        request({
          sourceIdea: {
            title: "  A useful idea  ",
            description: "  A concise creator-facing explanation.  ",
            category: "  Education  ",
          },
        }),
      ),
    ).toEqual(request());

    for (const sourceIdea of [
      { ...request().sourceIdea, title: "  " },
      { ...request().sourceIdea, description: " \r\n \t " },
      { ...request().sourceIdea, title: "multiple\nlines" },
      { ...request().sourceIdea, title: "x".repeat(121) },
      { ...request().sourceIdea, category: "multiple\nlines" },
      { ...request().sourceIdea, category: "x".repeat(81) },
      { ...request().sourceIdea, description: "x".repeat(501) },
    ]) {
      expect(() => parseGenerateContentScriptRequest(request({ sourceIdea }))).toThrow();
    }
  });

  it("reduces malformed provider-shaped results to INVALID_OUTPUT", () => {
    for (const output of [
      undefined,
      { schemaVersion: 1, script: { text: "Valid" }, unexpected: true },
      { schemaVersion: 1, script: { text: "Valid", unexpected: true } },
      { schemaVersion: 1, script: { text: " \r\n \t " } },
      { schemaVersion: 1, script: { text: "x".repeat(50_001) } },
    ]) {
      expect(parseGenerateContentScriptResult({ ok: true, output })).toEqual({
        ok: false,
        errorCategory: "INVALID_OUTPUT",
      });
    }
  });

  it("canonicalizes valid success output and retains only safe neutral metadata", () => {
    expect(
      parseGenerateContentScriptResult({
        ok: true,
        output: { schemaVersion: 1, script: { text: "  First\r\nSecond  " } },
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        providerRequestCorrelation: "request-123",
      }),
    ).toEqual({
      ok: true,
      output: { schemaVersion: 1, script: { text: "First\nSecond" } },
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      providerRequestCorrelation: "request-123",
    });
  });
});

describe("FakeGenerateContentScriptProvider", () => {
  it.each([
    ["en", "SHORT_VIDEO", "Deterministic English short-video script."],
    ["en", "LONG_VIDEO", "Deterministic English long-video script."],
    ["fa", "SHORT_VIDEO", "متن قطعی ویدیوی کوتاه فارسی."],
    ["fa", "LONG_VIDEO", "متن قطعی ویدیوی بلند فارسی."],
  ] as const)(
    "returns reproducible valid %s %s output",
    async (requestedLanguage, format, text) => {
      const first = new FakeGenerateContentScriptProvider();
      const second = new FakeGenerateContentScriptProvider();
      const input = request({ requestedLanguage, format });

      await expect(first.generateContentScript(input)).resolves.toEqual({
        ok: true,
        output: { schemaVersion: 1, script: { text } },
      });
      await expect(second.generateContentScript(input)).resolves.toEqual(
        await first.generateContentScript(input),
      );
    },
  );

  it("records exact canonical requests only when enabled and supports optional metadata", async () => {
    const provider = new FakeGenerateContentScriptProvider({
      recordRequests: true,
      usage: { inputTokens: 1 },
      providerRequestCorrelation: "safe-request-correlation",
    });
    const input = request();

    await expect(provider.generateContentScript(input)).resolves.toMatchObject({
      ok: true,
      usage: { inputTokens: 1 },
      providerRequestCorrelation: "safe-request-correlation",
    });
    expect(provider.invocationCount).toBe(1);
    expect(provider.requests).toEqual([input]);
    expect(provider.lastRequest).toEqual(input);
  });

  it("does not retain creator data unless test recording is explicitly enabled", async () => {
    const provider = new FakeGenerateContentScriptProvider();

    await provider.generateContentScript(request());

    expect(provider.requests).toEqual([]);
    expect(provider.lastRequest).toBeUndefined();
  });

  it("maps controlled malformed output to INVALID_OUTPUT", async () => {
    const provider = new FakeGenerateContentScriptProvider({
      output: { schemaVersion: 1, script: { text: "", unexpected: true } },
    });

    await expect(provider.generateContentScript(request())).resolves.toEqual({
      ok: false,
      errorCategory: "INVALID_OUTPUT",
    });
  });

  it.each([
    ["refusal", "INVALID_OUTPUT"],
    ["incomplete", "INVALID_OUTPUT"],
    ["malformed", "INVALID_OUTPUT"],
    ["invalid-output", "INVALID_OUTPUT"],
    ["timeout", "TIMEOUT"],
    ["rate-limited", "RATE_LIMITED"],
    ["provider-unavailable", "PROVIDER_UNAVAILABLE"],
    ["interrupted", "INTERRUPTED"],
    ["unknown", "UNKNOWN"],
  ] as const)("returns the safe %s scenario as %s", async (scenario, errorCategory) => {
    const provider = new FakeGenerateContentScriptProvider({ scenario });

    await expect(provider.generateContentScript(request())).resolves.toEqual({
      ok: false,
      errorCategory,
    });
    expect(provider.invocationCount).toBe(1);
  });
});
