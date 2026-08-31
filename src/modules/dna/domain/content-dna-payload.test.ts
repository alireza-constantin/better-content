import { describe, expect, it } from "vitest";

import {
  getContentDnaReadiness,
  parseContentDnaPayload,
} from "./content-dna-payload";

describe("Content DNA payload snapshot contract", () => {
  it("normalizes canonical absence, line endings, and ordered creator-defined lists", () => {
    const payload = parseContentDnaPayload({
      schemaVersion: 1,
      identity: { creatorOrBrandDescription: "  Creator\r\n\r\nwith mixed English and فارسی  " },
      expertise: { primaryTopics: ["  Productivity  ", "productivity", "کتاب"] },
      voice: { toneTraits: ["Warm", "warm", "Clear"], preferredStyle: "  " },
      goals: { contentGoals: ["Teach", "teach", "Entertain"] },
      preferences: { preferredFormats: ["Video", "video", "Live"], additionalInstructions: "\n  " },
      language: { contentLanguages: ["fa", "fa", "en"] },
    });

    expect(payload).toEqual({
      schemaVersion: 1,
      identity: { creatorOrBrandDescription: "Creator\n\nwith mixed English and فارسی" },
      expertise: { primaryTopics: ["Productivity", "کتاب"] },
      voice: { toneTraits: ["Warm", "Clear"] },
      goals: { contentGoals: ["Teach", "Entertain"] },
      preferences: { preferredFormats: ["Video", "Live"] },
      language: { contentLanguages: ["fa", "en"] },
    });
  });

  it("rejects unknown keys and logically inconsistent language preferences", () => {
    expect(() =>
      parseContentDnaPayload({
        schemaVersion: 1,
        identity: { creatorOrBrandDescription: "Creator", unsupported: "value" },
      }),
    ).toThrow();

    expect(() => parseContentDnaPayload({ schemaVersion: 1, unsupported: true })).toThrow();

    expect(() =>
      parseContentDnaPayload({
        schemaVersion: 1,
        language: { defaultContentLanguage: "en", contentLanguages: ["fa"] },
      }),
    ).toThrow();

    expect(() =>
      parseContentDnaPayload({
        schemaVersion: 1,
        language: { defaultContentLanguage: "en" },
      }),
    ).toThrow();

    expect(() =>
      parseContentDnaPayload({
        schemaVersion: 1,
        language: { contentLanguages: ["de"] },
      }),
    ).toThrow();
  });

  it("rejects blank list entries and values outside the approved storage limits", () => {
    expect(() =>
      parseContentDnaPayload({
        schemaVersion: 1,
        expertise: { primaryTopics: [" "] },
      }),
    ).toThrow();

    expect(() =>
      parseContentDnaPayload({
        schemaVersion: 1,
        goals: { contentGoals: ["x".repeat(121)] },
      }),
    ).toThrow();
  });

  it("derives AI readiness without persisting a lifecycle status", () => {
    const incompletePayload = parseContentDnaPayload({
      schemaVersion: 1,
      identity: { creatorOrBrandDescription: "Creator" },
    });
    const readyPayload = parseContentDnaPayload({
      schemaVersion: 1,
      identity: { creatorOrBrandDescription: "Creator" },
      audience: { targetAudienceDescription: "New creators" },
      expertise: { primaryTopics: ["Education"] },
      voice: { toneTraits: ["Clear"] },
      goals: { contentGoals: ["Teach"] },
      language: { defaultContentLanguage: "fa", contentLanguages: ["en", "fa"] },
    });

    expect(getContentDnaReadiness(incompletePayload)).toBe("INCOMPLETE");
    expect(getContentDnaReadiness(readyPayload)).toBe("AI_READY");
  });
});
