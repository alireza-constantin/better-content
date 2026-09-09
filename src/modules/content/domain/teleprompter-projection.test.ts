import { describe, expect, it } from "vitest";

import {
  projectContentDocumentToTeleprompter,
  type ContentDocumentV2,
  type ContentDocumentV3,
} from "./content-script-contracts";

const id = (suffix: string) => `00000000-0000-4000-8000-0000000000${suffix}`;

describe("Teleprompter document projection", () => {
  it("keeps a V1 Script as one exact block without treating lines as directions", () => {
    const text = "  سلام, creator\nSecond line  ";

    expect(projectContentDocumentToTeleprompter({ schemaVersion: 1, script: { text } })).toEqual([
      { id: "legacy-script", text, performanceHints: [] },
    ]);
  });

  it("preserves V2 block and Performance Direction order while omitting Edit Directions", () => {
    const document: ContentDocumentV2 = {
      schemaVersion: 2,
      script: {
        blocks: [
          {
            id: id("01"),
            type: "paragraph",
            text: "First",
            performanceDirections: [
              { id: id("02"), type: "PAUSE", duration: "short", nuance: "bidi note" },
              { id: id("03"), type: "PERFORMANCE_NOTE", text: "با انرژی" },
            ],
            editDirections: [{ id: id("04"), type: "CUT", style: "hard" }],
          },
          {
            id: id("05"),
            type: "paragraph",
            text: "Second",
            performanceDirections: [],
            editDirections: [],
          },
        ],
      },
    };

    expect(projectContentDocumentToTeleprompter(document)).toEqual([
      {
        id: id("01"),
        text: "First",
        performanceHints: [
          { id: id("02"), type: "PAUSE", values: ["short"], nuance: "bidi note" },
          { id: id("03"), type: "PERFORMANCE_NOTE", values: [], text: "با انرژی" },
        ],
      },
      { id: id("05"), text: "Second", performanceHints: [] },
    ]);
  });

  it("projects V3 using the same read-only presentation without changing the document", () => {
    const document: ContentDocumentV3 = {
      schemaVersion: 3,
      script: {
        blocks: [
          {
            id: id("06"),
            type: "paragraph",
            text: "V3",
            performanceDirections: [
              { id: id("07"), type: "DELIVERY", tone: "warm", pace: "slower" },
              { id: id("08"), type: "GAZE", target: "camera" },
              { id: id("09"), type: "EMPHASIS", strength: "strong" },
              { id: id("10"), type: "GESTURE", kind: "point" },
              { id: id("11"), type: "POSITION", action: "stand" },
            ],
            editDirections: [
              { id: id("12"), type: "BROLL_CUE", description: "image", assetId: id("13") },
            ],
          },
        ],
      },
    };

    const projected = projectContentDocumentToTeleprompter(document);

    expect(projected[0]?.performanceHints.map((hint) => hint.type)).toEqual([
      "DELIVERY",
      "GAZE",
      "EMPHASIS",
      "GESTURE",
      "POSITION",
    ]);
    expect(document.script.blocks[0]?.editDirections[0]?.type).toBe("BROLL_CUE");
  });
});
