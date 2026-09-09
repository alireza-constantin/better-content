import { describe, expect, it } from "vitest";

import {
  projectContentDocumentToEditGuide,
  type ContentDocumentV2,
  type ContentDocumentV3,
  type ContentDocumentV4,
} from "./content-script-contracts";

const id = (tail: string) => `00000000-0000-4000-8000-0000000000${tail}`;

const v2: ContentDocumentV2 = {
  schemaVersion: 2,
  script: {
    blocks: [
      {
        id: id("01"),
        type: "paragraph",
        text: "First block",
        performanceDirections: [],
        editDirections: [
          { id: id("02"), type: "CUT", style: "hard" },
          { id: id("03"), type: "EDIT_NOTE", text: "Keep the reaction." },
        ],
      },
      {
        id: id("04"),
        type: "paragraph",
        text: "Second block / متن دوم",
        performanceDirections: [],
        editDirections: [],
      },
    ],
  },
};

const v3: ContentDocumentV3 = {
  schemaVersion: 3,
  script: {
    blocks: [
      {
        ...v2.script.blocks[0],
        editDirections: [
          {
            id: id("05"),
            type: "BROLL_CUE",
            description: "Show the product in hand",
            assetId: id("06"),
          },
        ],
      },
    ],
  },
};

const v4: ContentDocumentV4 = {
  schemaVersion: 4,
  script: {
    blocks: [
      {
        id: id("07"),
        type: "paragraph",
        text: "A V4 creator line",
        performanceDirections: [],
        editDirections: [
          {
            id: id("08"),
            type: "BROLL_CUE",
            description: "Show a mixed-direction query",
            searchQuery: "creator desk 42",
          },
        ],
      },
    ],
  },
};

describe("Edit Guide document projection", () => {
  it("keeps a legacy V1 Script exact and does not invent directions", () => {
    const legacy = { schemaVersion: 1 as const, script: { text: "  exact\nlegacy  " } };

    expect(projectContentDocumentToEditGuide(legacy)).toEqual([
      { id: "legacy-script", text: "  exact\nlegacy  ", editDirections: [] },
    ]);
  });

  it.each([
    ["V2", v2],
    ["V3", v3],
    ["V4", v4],
  ] as const)("preserves %s Script and Edit Direction order and payloads", (_label, document) => {
    const projected = projectContentDocumentToEditGuide(document);
    expect(projected.map((block) => block.text)).toEqual(
      document.script.blocks.map((block) => block.text),
    );
    expect(projected[0]?.editDirections).toEqual(document.script.blocks[0]?.editDirections);
  });

  it("does not mutate the V4 source while preserving the search query", () => {
    const before = structuredClone(v4);

    expect(projectContentDocumentToEditGuide(v4)[0]?.editDirections[0]).toMatchObject({
      type: "BROLL_CUE",
      searchQuery: "creator desk 42",
    });
    expect(v4).toEqual(before);
  });
});
