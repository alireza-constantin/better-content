import { describe, expect, it } from "vitest";

import {
  canonicalContentScriptGenerationRequestSchema,
  contentGenerationAttemptLifecycleSchema,
  contentGenerationRateLimitSourceSchema,
  contentScriptGenerationFailureCategorySchema,
  contentScriptDocumentSchema,
  contentScriptFormatSchema,
  contentVersionSourceSchema,
  fingerprintContentScriptGenerationRequest,
  generationLanguageSchema,
  parseCanonicalContentScriptGenerationRequest,
  parseGeneratedContentScriptDocument,
  parseHumanContentScriptDraft,
  serializeContentScriptGenerationRequest,
} from "./content-script-contracts";

const ids = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  sourceIdeaId: "22222222-2222-4222-8222-222222222222",
  baseContentDnaVersionId: "33333333-3333-4333-8333-333333333333",
  idempotencyKey: "44444444-4444-4444-8444-444444444444",
};

function documentWith(text: string) {
  return { schemaVersion: 1, script: { text } };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    ...ids,
    requestedLanguage: "en",
    format: "SHORT_VIDEO",
    instructions: "  Focus on an actionable example.  ",
    ...overrides,
  };
}

describe("content_script_v1 documents", () => {
  it("accepts only the exact schema-v1 plain-text document shape", () => {
    expect(contentScriptDocumentSchema.parse(documentWith("Hello"))).toEqual(documentWith("Hello"));

    expect(() =>
      contentScriptDocumentSchema.parse({ ...documentWith("Hello"), extra: true }),
    ).toThrow();
    expect(() =>
      contentScriptDocumentSchema.parse({
        schemaVersion: 1,
        script: { text: "Hello", extra: true },
      }),
    ).toThrow();
    expect(() => contentScriptDocumentSchema.parse(documentWith(1 as unknown as string))).toThrow();
  });

  it.each([
    ["LF", "one\ntwo", "one\ntwo"],
    ["CRLF", "one\r\ntwo", "one\ntwo"],
    ["CR", "one\rtwo", "one\ntwo"],
  ])("normalizes %s line endings for generated scripts", (_label, source, expected) => {
    expect(parseGeneratedContentScriptDocument(documentWith(source))).toEqual(
      documentWith(expected),
    );
  });

  it("outer-trims generated text and rejects blank generated output", () => {
    expect(parseGeneratedContentScriptDocument(documentWith("  \r\n  Hello  \r\n  "))).toEqual(
      documentWith("Hello"),
    );
    expect(() => parseGeneratedContentScriptDocument(documentWith(" \r\n \t "))).toThrow();
  });

  it("preserves human Draft whitespace while allowing an empty Draft", () => {
    expect(parseHumanContentScriptDraft(documentWith("  \r\n  Hello  \r\n  "))).toEqual(
      documentWith("  \n  Hello  \n  "),
    );
    expect(parseHumanContentScriptDraft(documentWith(""))).toEqual(documentWith(""));
    expect(parseHumanContentScriptDraft(documentWith(" \t\n "))).toEqual(documentWith(" \t\n "));
  });

  it.each([
    [0, true],
    [1, true],
    [50_000, true],
    [50_001, false],
  ])("enforces the human Draft %s-character boundary", (length, valid) => {
    const parse = () => parseHumanContentScriptDraft(documentWith("x".repeat(length)));
    if (valid) {
      expect(parse()).toEqual(documentWith("x".repeat(length)));
    } else {
      expect(parse).toThrow();
    }
  });

  it.each([
    [0, false],
    [1, true],
    [50_000, true],
    [50_001, false],
  ])(
    "enforces the generated-script %s-character boundary after canonicalization",
    (length, valid) => {
      const parse = () => parseGeneratedContentScriptDocument(documentWith("x".repeat(length)));
      if (valid) {
        expect(parse()).toEqual(documentWith("x".repeat(length)));
      } else {
        expect(parse).toThrow();
      }
    },
  );
});

describe("canonical Content Script generation requests", () => {
  it("normalizes instructions to canonical absence or trimmed text within the 1,000-character limit", () => {
    expect(parseCanonicalContentScriptGenerationRequest(request())).toEqual({
      ...request(),
      instructions: "Focus on an actionable example.",
    });
    expect(
      parseCanonicalContentScriptGenerationRequest(request({ instructions: " \r\n \t " })),
    ).toEqual({
      ...request({ instructions: undefined }),
    });
    expect(
      parseCanonicalContentScriptGenerationRequest(request({ instructions: "x".repeat(1_000) })),
    ).toMatchObject({ instructions: "x".repeat(1_000) });
    expect(() =>
      parseCanonicalContentScriptGenerationRequest(request({ instructions: "x".repeat(1_001) })),
    ).toThrow();
  });

  it("accepts exactly the approved request input and language/format values", () => {
    expect(
      canonicalContentScriptGenerationRequestSchema.parse(request({ instructions: undefined })),
    ).toEqual(request({ instructions: undefined }));
    expect(generationLanguageSchema.options).toEqual(["en", "fa"]);
    expect(contentScriptFormatSchema.options).toEqual(["SHORT_VIDEO", "LONG_VIDEO"]);
    expect(() =>
      parseCanonicalContentScriptGenerationRequest(request({ requestedLanguage: "de" })),
    ).toThrow();
    expect(() =>
      parseCanonicalContentScriptGenerationRequest(request({ format: "ARTICLE" })),
    ).toThrow();
    expect(() =>
      parseCanonicalContentScriptGenerationRequest(request({ provider: "AvalAI", uiLocale: "fa" })),
    ).toThrow();
  });

  it("fingerprints only the approved canonical business facts", () => {
    const canonical = parseCanonicalContentScriptGenerationRequest(request());
    const sameBusinessFacts = {
      ...canonical,
      idempotencyKey: "55555555-5555-4555-8555-555555555555",
    };

    expect(fingerprintContentScriptGenerationRequest(canonical)).toBe(
      fingerprintContentScriptGenerationRequest(sameBusinessFacts),
    );
    expect(
      fingerprintContentScriptGenerationRequest(
        request({ instructions: "Focus on an actionable example." }),
      ),
    ).toBe(fingerprintContentScriptGenerationRequest(canonical));
    expect(serializeContentScriptGenerationRequest(canonical)).toContain(
      "14:generationKind:25:CONTENT_SCRIPT_GENERATION",
    );
  });

  it.each([
    ["source Idea", { sourceIdeaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
    ["DNA version", { baseContentDnaVersionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }],
    ["language", { requestedLanguage: "fa" }],
    ["format", { format: "LONG_VIDEO" }],
    ["instructions", { instructions: "Use a sharper opening." }],
  ])("changes the fingerprint when the included %s changes", (_label, changed) => {
    expect(fingerprintContentScriptGenerationRequest(request(changed))).not.toBe(
      fingerprintContentScriptGenerationRequest(request()),
    );
  });

  it("excludes workspace and key while rejecting every non-business fingerprint field", () => {
    const canonical = parseCanonicalContentScriptGenerationRequest(request());
    const fingerprint = fingerprintContentScriptGenerationRequest(canonical);

    expect(
      fingerprintContentScriptGenerationRequest({
        ...canonical,
        workspaceId: "66666666-6666-4666-8666-666666666666",
        idempotencyKey: "77777777-7777-4777-8777-777777777777",
      }),
    ).toBe(fingerprint);

    for (const field of [
      "uiLocale",
      "provider",
      "model",
      "prompt",
      "promptVersion",
      "contentDnaBody",
      "ideaStatus",
    ]) {
      expect(() =>
        parseCanonicalContentScriptGenerationRequest({ ...canonical, [field]: "excluded" }),
      ).toThrow();
    }
  });
});

describe("Phase 4 shared vocabulary", () => {
  it("uses the approved Content version source and application rate-limit sources only", () => {
    expect(contentVersionSourceSchema.parse("AI_GENERATED")).toBe("AI_GENERATED");
    expect(contentGenerationRateLimitSourceSchema.options).toEqual(["WORKSPACE", "PROVIDER"]);
    expect(() => contentVersionSourceSchema.parse("ACCEPTED_SNAPSHOT")).toThrow();
    expect(() => contentGenerationRateLimitSourceSchema.parse("workspace")).toThrow();
  });

  it("reuses exhaustive shared lifecycle and failure-category values", () => {
    expect(contentGenerationAttemptLifecycleSchema.options).toEqual([
      "PENDING",
      "RUNNING",
      "COMPLETED",
      "FAILED",
    ]);
    expect(contentScriptGenerationFailureCategorySchema.options).toEqual([
      "TIMEOUT",
      "RATE_LIMITED",
      "PROVIDER_UNAVAILABLE",
      "INVALID_OUTPUT",
      "INTERRUPTED",
      "UNKNOWN",
    ]);
    expect(() => contentGenerationAttemptLifecycleSchema.parse("CANCELLED")).toThrow();
    expect(() => contentScriptGenerationFailureCategorySchema.parse("REFUSED")).toThrow();
  });
});
