import { describe, expect, it } from "vitest";

import {
  createGenerateIdeasFailure,
  createGenerateIdeasSuccess,
  generateIdeasFailureCategorySchema,
  generateIdeasRequestSchema,
  generateIdeasResultSchema,
  parseGenerateIdeasRequest,
  parseGenerateIdeasResult,
  type GenerateIdeasRequest,
} from "./generate-ideas";

const request: GenerateIdeasRequest = {
  generationKind: "IDEA_GENERATION",
  contentDna: {
    schemaVersion: 1,
    identity: { creatorOrBrandDescription: "Creator" },
  },
  requestedLanguage: "en",
  requestedCount: 20,
  promptVersion: "idea-generation/v1",
};

function validOutput() {
  return {
    schemaVersion: 1,
    ideas: Array.from({ length: 20 }, (_, index) => ({
      title: `Idea ${index + 1}`,
      description: `Description ${index + 1}`,
      category: index === 0 ? "  Education  " : "Education",
    })),
  };
}

describe("GenerateIdeas provider-neutral contract", () => {
  it("accepts canonical DNA context without duplicating readiness checks", () => {
    expect(parseGenerateIdeasRequest(request)).toEqual(request);

    expect(() =>
      parseGenerateIdeasRequest({
        ...request,
        contentDna: { ...request.contentDna, unsupported: true },
      }),
    ).toThrow();
  });

  it("keeps the provider request separate from fingerprint-only fields", () => {
    expect(generateIdeasRequestSchema.parse(request)).toEqual(request);
    expect(() =>
      generateIdeasRequestSchema.parse({ ...request, workspaceId: "not-provider-input" }),
    ).toThrow();
    expect(() =>
      generateIdeasRequestSchema.parse({ ...request, requestedLanguage: "de" }),
    ).toThrow();
    expect(() => generateIdeasRequestSchema.parse({ ...request, requestedCount: 19 })).toThrow();
  });

  it("canonicalizes success output before exposing it", () => {
    const result = createGenerateIdeasSuccess(validOutput(), {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
    });

    expect(result).toEqual({
      ok: true,
      output: {
        schemaVersion: 1,
        ideas: [
          {
            title: "Idea 1",
            description: "Description 1",
            category: "Education",
          },
          ...Array.from({ length: 19 }, (_, index) => ({
            title: `Idea ${index + 2}`,
            description: `Description ${index + 2}`,
            category: "Education",
          })),
        ],
      },
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });
    expect(generateIdeasResultSchema.parse(result)).toEqual(result);
  });

  it.each([
    { label: "wrong count", output: { ...validOutput(), ideas: [] } },
    { label: "unknown key", output: { ...validOutput(), extra: true } },
    {
      label: "duplicate title",
      output: {
        ...validOutput(),
        ideas: validOutput().ideas.map((idea, index) =>
          index < 2 ? { ...idea, title: "Same" } : idea,
        ),
      },
    },
  ])("maps $label output to INVALID_OUTPUT", ({ output }) => {
    expect(createGenerateIdeasSuccess(output)).toEqual({
      ok: false,
      errorCategory: "INVALID_OUTPUT",
    });
  });

  it("exposes only approved provider failure categories", () => {
    expect(generateIdeasFailureCategorySchema.options).toEqual([
      "TIMEOUT",
      "RATE_LIMITED",
      "PROVIDER_UNAVAILABLE",
      "INVALID_OUTPUT",
      "UNKNOWN",
    ]);
    expect(createGenerateIdeasFailure("UNKNOWN")).toEqual({
      ok: false,
      errorCategory: "UNKNOWN",
    });
    expect(() => createGenerateIdeasFailure("INTERRUPTED" as never)).toThrow();
    expect(
      parseGenerateIdeasResult({ ok: false, errorCategory: "UNKNOWN", raw: "secret" }),
    ).toEqual({
      ok: false,
      errorCategory: "INVALID_OUTPUT",
    });
  });

  it("does not expose invalid provider-neutral usage as success", () => {
    expect(createGenerateIdeasSuccess(validOutput(), { providerUsage: {} })).toEqual({
      ok: false,
      errorCategory: "INVALID_OUTPUT",
    });
  });
});
