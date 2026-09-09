import { describe, expect, it } from "vitest";

import {
  contentDocumentV4Schema,
  contentDocumentsEqual,
  parseGeneratedContentDocumentV4,
  projectContentDocumentV3ToV4,
  type ContentDocumentV3,
} from "./content-script-contracts";

const id = (tail: string) => `00000000-0000-4000-8000-0000000000${tail}`;
const v3: ContentDocumentV3 = {
  schemaVersion: 3,
  script: {
    blocks: [
      {
        id: id("01"),
        type: "paragraph",
        text: "A script block",
        performanceDirections: [{ id: id("02"), type: "PAUSE", duration: "short" }],
        editDirections: [
          { id: id("03"), type: "BROLL_CUE", description: "A useful visual", assetId: id("04") },
        ],
      },
    ],
  },
};

describe("ContentDocumentV4", () => {
  it("projects V3 losslessly and treats a query-free projection as equal", () => {
    const projected = projectContentDocumentV3ToV4(v3);
    expect(projected.schemaVersion).toBe(4);
    expect(projected.script.blocks[0]).toMatchObject(v3.script.blocks[0]);
    expect(projected.script.blocks[0].editDirections[0]).not.toHaveProperty("searchQuery");
    expect(contentDocumentsEqual(v3, projected)).toBe(true);
  });

  it("accepts only canonical B-roll search text", () => {
    const withQuery = structuredClone(projectContentDocumentV3ToV4(v3));
    (withQuery.script.blocks[0].editDirections[0] as { searchQuery?: string }).searchQuery =
      "person scrolling phone";
    expect(contentDocumentV4Schema.parse(withQuery)).toEqual(withQuery);
    (withQuery.script.blocks[0].editDirections[0] as { searchQuery?: string }).searchQuery =
      "x\n y";
    expect(() => contentDocumentV4Schema.parse(withQuery)).toThrow();
  });

  it("materializes trusted IDs and rejects generated asset identity", () => {
    const output = parseGeneratedContentDocumentV4({
      schemaVersion: 1,
      script: {
        blocks: [
          {
            type: "paragraph",
            text: "Say this",
            performanceDirections: [],
            editDirections: [
              {
                type: "BROLL_CUE",
                description: "Show a phone",
                searchQuery: "person scrolling social media phone",
              },
            ],
          },
        ],
      },
    });
    expect(output.schemaVersion).toBe(4);
    expect(output.script.blocks[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(() =>
      parseGeneratedContentDocumentV4({
        schemaVersion: 1,
        script: {
          blocks: [
            {
              type: "paragraph",
              text: "Say this",
              performanceDirections: [],
              editDirections: [
                { type: "BROLL_CUE", description: "Show", searchQuery: "https://example.com" },
              ],
            },
          ],
        },
      }),
    ).toThrow();
  });
});
