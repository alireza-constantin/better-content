import { describe, expect, it } from "vitest";

import { FakeGenerateIdeasProvider } from "./fake-generate-ideas-provider";
import type { GenerateIdeasRequest } from "@/modules/ai/domain/generate-ideas";

const request: GenerateIdeasRequest = {
  generationKind: "IDEA_GENERATION",
  contentDna: { schemaVersion: 1 },
  requestedLanguage: "fa",
  requestedCount: 20,
  promptVersion: "idea-generation/v1",
};

function customOutput() {
  return {
    schemaVersion: 1,
    ideas: Array.from({ length: 20 }, (_, index) => ({
      title: `Custom ${index + 1}`,
      description: `Custom description ${index + 1}`,
    })),
  };
}

describe("FakeGenerateIdeasProvider", () => {
  it("returns deterministic canonical output and records invocation count", async () => {
    const first = new FakeGenerateIdeasProvider();
    const second = new FakeGenerateIdeasProvider();

    const firstResult = await first.generateIdeas(request);
    const secondResult = await second.generateIdeas(request);

    expect(firstResult).toEqual(secondResult);
    expect(firstResult.ok).toBe(true);
    if (firstResult.ok) {
      expect(firstResult.output.schemaVersion).toBe(1);
      expect(firstResult.output.ideas).toHaveLength(20);
      expect(firstResult.output.ideas[0]?.title).toBe("ایده آزمایشی 1");
    }
    expect(first.invocationCount).toBe(1);
    expect(second.invocationCount).toBe(1);
  });

  it("accepts custom output, normalizes it, and records canonical requests when enabled", async () => {
    const provider = new FakeGenerateIdeasProvider({
      output: {
        ...customOutput(),
        ideas: customOutput().ideas.map((idea, index) =>
          index === 0
            ? { ...idea, title: "  Custom 1  ", description: "  first\r\nline  ", category: null }
            : idea,
        ),
      },
      recordRequests: true,
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    });

    const result = await provider.generateIdeas(request);

    expect(result).toEqual({
      ok: true,
      output: {
        schemaVersion: 1,
        ideas: [
          { title: "Custom 1", description: "first\nline" },
          ...Array.from({ length: 19 }, (_, index) => ({
            title: `Custom ${index + 2}`,
            description: `Custom description ${index + 2}`,
          })),
        ],
      },
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    });
    expect(provider.invocationCount).toBe(1);
    expect(provider.requests).toEqual([request]);
    expect(provider.lastRequest).toEqual(request);
  });

  it("maps invalid custom output to a safe failure", async () => {
    const provider = new FakeGenerateIdeasProvider({ output: { schemaVersion: 1, ideas: [] } });

    await expect(provider.generateIdeas(request)).resolves.toEqual({
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
    ["unknown", "UNKNOWN"],
  ] as const)("returns the safe %s scenario as %s", async (scenario, errorCategory) => {
    const provider = new FakeGenerateIdeasProvider({ scenario });

    await expect(provider.generateIdeas(request)).resolves.toEqual({
      ok: false,
      errorCategory,
    });
    expect(provider.invocationCount).toBe(1);
  });

  it("does not retain requests unless recording is explicitly enabled", async () => {
    const provider = new FakeGenerateIdeasProvider();

    await provider.generateIdeas(request);

    expect(provider.requests).toEqual([]);
    expect(provider.lastRequest).toBeUndefined();
  });
});
