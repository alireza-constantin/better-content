import { describe, expect, it } from "vitest";

import {
  canonicalIdeaGenerationRequestSchema,
  decisionStateSchema,
  failureCategorySchema,
  canTransitionGenerationLifecycle,
  fingerprintIdeaGenerationRequest,
  generationLifecycleSchema,
  getDecisionUpdate,
  parseCanonicalIdeaGenerationOutput,
  parseGenerationSettings,
  parseProviderNeutralUsage,
  parseGenerationLanguage,
  type CanonicalIdeaGenerationOutputInput,
} from "./idea-generation-contracts";

const baseContentDnaVersionId = "11111111-1111-4111-8111-111111111111";

function validIdea(index: number): CanonicalIdeaGenerationOutputInput["ideas"][number] {
  return {
    title: `Idea ${index}`,
    description: `Description for idea ${index}.`,
    category: "Education",
  };
}

function validOutput() {
  return {
    schemaVersion: 1,
    ideas: Array.from({ length: 20 }, (_, index) => validIdea(index + 1)),
  };
}

describe("canonical idea-generation output", () => {
  it("accepts exactly 20 ideas and preserves order and display casing", () => {
    const input = validOutput();
    input.ideas[0] = {
      title: "  First Idea  ",
      description: "  First description\r\nwith a new line  ",
      category: "  Education  ",
    };

    expect(parseCanonicalIdeaGenerationOutput(input)).toEqual({
      schemaVersion: 1,
      ideas: [
        {
          title: "First Idea",
          description: "First description\nwith a new line",
          category: "Education",
        },
        ...Array.from({ length: 19 }, (_, index) => validIdea(index + 2)),
      ],
    });
  });

  it.each([19, 21])("rejects %s ideas", (count) => {
    const input = validOutput();
    input.ideas = Array.from({ length: count }, (_, index) => validIdea(index + 1));

    expect(() => parseCanonicalIdeaGenerationOutput(input)).toThrow();
  });

  it("requires schema version 1 and rejects unknown keys", () => {
    expect(() =>
      parseCanonicalIdeaGenerationOutput({ ...validOutput(), schemaVersion: 2 }),
    ).toThrow();
    expect(() => parseCanonicalIdeaGenerationOutput({ ...validOutput(), extra: true })).toThrow();
    expect(() =>
      parseCanonicalIdeaGenerationOutput({
        ...validOutput(),
        ideas: [{ ...validIdea(1), extra: true }, ...validOutput().ideas.slice(1)],
      }),
    ).toThrow();
  });

  it("rejects multiline and out-of-range title values", () => {
    const multiline = validOutput();
    multiline.ideas[0].title = "line one\nline two";
    expect(() => parseCanonicalIdeaGenerationOutput(multiline)).toThrow();

    for (const title of ["", " ", "x".repeat(121)]) {
      const input = validOutput();
      input.ideas[0].title = title;
      expect(() => parseCanonicalIdeaGenerationOutput(input)).toThrow();
    }
  });

  it("normalizes categories to optional canonical absence", () => {
    const blankCategory = validOutput();
    blankCategory.ideas[0].category = "  ";
    expect(parseCanonicalIdeaGenerationOutput(blankCategory).ideas[0]).not.toHaveProperty(
      "category",
    );

    const nullCategory = validOutput();
    nullCategory.ideas[0].category = null;
    expect(parseCanonicalIdeaGenerationOutput(nullCategory).ideas[0]).not.toHaveProperty(
      "category",
    );

    const multiline = validOutput();
    multiline.ideas[0].category = "one\ntwo";
    expect(() => parseCanonicalIdeaGenerationOutput(multiline)).toThrow();

    const tooLong = validOutput();
    tooLong.ideas[0].category = "x".repeat(81);
    expect(() => parseCanonicalIdeaGenerationOutput(tooLong)).toThrow();
  });

  it("normalizes descriptions and enforces their limits", () => {
    const input = validOutput();
    input.ideas[0].description = "  first\rsecond\r\nthird  ";
    expect(parseCanonicalIdeaGenerationOutput(input).ideas[0].description).toBe(
      "first\nsecond\nthird",
    );

    for (const description of ["", " ", "x".repeat(501)]) {
      const invalid = validOutput();
      invalid.ideas[0].description = description;
      expect(() => parseCanonicalIdeaGenerationOutput(invalid)).toThrow();
    }
  });

  it("rejects case-insensitive duplicate titles after normalization", () => {
    const input = validOutput();
    input.ideas[0].title = "  Same title ";
    input.ideas[1].title = "SAME TITLE";

    expect(() => parseCanonicalIdeaGenerationOutput(input)).toThrow();
  });
});

describe("canonical generation request and fingerprint", () => {
  const request = {
    generationKind: "IDEA_GENERATION" as const,
    baseContentDnaVersionId,
    requestedLanguage: "en" as const,
    requestedCount: 20 as const,
  };

  it("accepts only the approved languages and fixed count", () => {
    expect(canonicalIdeaGenerationRequestSchema.parse(request)).toEqual(request);
    expect(parseGenerationLanguage("en")).toBe("en");
    expect(parseGenerationLanguage("fa")).toBe("fa");
    expect(() => parseGenerationLanguage("de")).toThrow();
    expect(() =>
      canonicalIdeaGenerationRequestSchema.parse({ ...request, requestedCount: 19 }),
    ).toThrow();
  });

  it("produces a deterministic fingerprint from immutable request inputs only", () => {
    const sameRequest = { ...request };
    expect(fingerprintIdeaGenerationRequest(request)).toBe(
      fingerprintIdeaGenerationRequest(sameRequest),
    );
    expect(
      fingerprintIdeaGenerationRequest({
        ...request,
        baseContentDnaVersionId: "22222222-2222-4222-8222-222222222222",
      }),
    ).not.toBe(fingerprintIdeaGenerationRequest(request));
    expect(fingerprintIdeaGenerationRequest({ ...request, requestedLanguage: "fa" })).not.toBe(
      fingerprintIdeaGenerationRequest(request),
    );
  });

  it("rejects request fields outside the canonical identity", () => {
    expect(() =>
      canonicalIdeaGenerationRequestSchema.parse({
        ...request,
        workspaceId: "private",
        uiLocale: "fa",
      }),
    ).toThrow();
  });
});

describe("idea decisions", () => {
  it("contains only persistent decision states and validates transitions", () => {
    expect(decisionStateSchema.options).toEqual(["NEW", "SAVED", "ACCEPTED", "REJECTED"]);
    expect(() => decisionStateSchema.parse("USED")).toThrow();

    expect(getDecisionUpdate({ currentState: "NEW", nextState: "ACCEPTED" })).toEqual({
      status: "ACCEPTED",
      rejectionReason: undefined,
      isNoop: false,
    });
  });

  it("treats same-state updates as no-ops and clears rejection reasons when leaving REJECTED", () => {
    expect(
      getDecisionUpdate({
        currentState: "REJECTED",
        nextState: "REJECTED",
        rejectionReason: "  too broad  ",
      }),
    ).toEqual({ status: "REJECTED", rejectionReason: "too broad", isNoop: true });
    expect(
      getDecisionUpdate({
        currentState: "REJECTED",
        nextState: "SAVED",
        rejectionReason: "No longer relevant",
      }),
    ).toEqual({
      status: "SAVED",
      rejectionReason: undefined,
      isNoop: false,
    });
    expect(
      getDecisionUpdate({ currentState: "SAVED", nextState: "SAVED", rejectionReason: "stale" }),
    ).toEqual({
      status: "SAVED",
      rejectionReason: undefined,
      isNoop: true,
    });
  });

  it("normalizes blank reasons and rejects reasons longer than 500 characters", () => {
    expect(
      getDecisionUpdate({ currentState: "NEW", nextState: "REJECTED", rejectionReason: "  " }),
    ).toEqual({
      status: "REJECTED",
      rejectionReason: undefined,
      isNoop: false,
    });
    expect(() =>
      getDecisionUpdate({
        currentState: "NEW",
        nextState: "REJECTED",
        rejectionReason: "x".repeat(501),
      }),
    ).toThrow();
    expect(
      getDecisionUpdate({ currentState: "NEW", nextState: "SAVED", rejectionReason: "reason" }),
    ).toEqual({
      status: "SAVED",
      rejectionReason: undefined,
      isNoop: false,
    });
  });
});

describe("provider-neutral AI contracts", () => {
  it("restricts lifecycle statuses and failure categories to the approved values", () => {
    expect(generationLifecycleSchema.options).toEqual([
      "PENDING",
      "RUNNING",
      "COMPLETED",
      "FAILED",
    ]);
    expect(failureCategorySchema.options).toEqual([
      "TIMEOUT",
      "RATE_LIMITED",
      "PROVIDER_UNAVAILABLE",
      "INVALID_OUTPUT",
      "INTERRUPTED",
      "UNKNOWN",
    ]);
    expect(() => generationLifecycleSchema.parse("SUCCEEDED")).toThrow();
  });

  it("allows only forward lifecycle transitions, with same-state no-ops", () => {
    expect(canTransitionGenerationLifecycle("PENDING", "PENDING")).toBe(true);
    expect(canTransitionGenerationLifecycle("PENDING", "RUNNING")).toBe(true);
    expect(canTransitionGenerationLifecycle("RUNNING", "COMPLETED")).toBe(true);
    expect(canTransitionGenerationLifecycle("RUNNING", "FAILED")).toBe(true);
    expect(canTransitionGenerationLifecycle("PENDING", "COMPLETED")).toBe(false);
    expect(canTransitionGenerationLifecycle("COMPLETED", "RUNNING")).toBe(false);
    expect(canTransitionGenerationLifecycle("FAILED", "PENDING")).toBe(false);
  });

  it("validates non-negative integer usage values and rejects unknown data", () => {
    expect(parseProviderNeutralUsage({ inputTokens: 1, totalTokens: 2 })).toEqual({
      inputTokens: 1,
      totalTokens: 2,
    });
    expect(() => parseProviderNeutralUsage({ outputTokens: -1 })).toThrow();
    expect(() => parseProviderNeutralUsage({ outputTokens: 1.5 })).toThrow();
    expect(() => parseProviderNeutralUsage({ inputTokens: 1, providerUsage: {} })).toThrow();
  });

  it("validates the fixed generation settings audit shape", () => {
    expect(
      parseGenerationSettings({
        structuredOutput: { schemaName: "idea_generation_v1", schemaVersion: 1 },
        reasoningEffort: "medium",
        maxOutputTokens: 16_000,
        timeoutSeconds: 60,
        retryPolicy: { maxRetries: 0 },
        serviceTier: "default",
      }),
    ).toMatchObject({ reasoningEffort: "medium", timeoutSeconds: 60 });
    expect(() =>
      parseGenerationSettings({
        structuredOutput: { schemaName: "idea_generation_v1", schemaVersion: 1 },
        reasoningEffort: "high",
        maxOutputTokens: 16_000,
        timeoutSeconds: 60,
        retryPolicy: { maxRetries: 0 },
        serviceTier: "default",
      }),
    ).toThrow();
    expect(() =>
      parseGenerationSettings({
        structuredOutput: { schemaName: "idea_generation_v1", schemaVersion: 1 },
        reasoningEffort: "medium",
        maxOutputTokens: 16_000,
        timeoutSeconds: 60,
        retryPolicy: { maxRetries: 0 },
        serviceTier: "default",
        providerSpecific: true,
      }),
    ).toThrow();
  });
});
