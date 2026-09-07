import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  contentDocumentV3Schema,
  contentDocumentsEqual,
  extractAssetReferences,
  projectContentDocumentV2ToV3,
} from "./index";

const blockId = randomUUID();
const brollId = randomUUID();
const soundId = randomUUID();
const v2 = {
  schemaVersion: 2 as const,
  script: {
    blocks: [
      {
        id: blockId,
        type: "paragraph" as const,
        text: "A line",
        performanceDirections: [],
        editDirections: [
          { id: brollId, type: "BROLL_CUE" as const, description: "Cutaway" },
          { id: soundId, type: "SOUND_CUE" as const, kind: "music" as const, description: "Bed" },
        ],
      },
    ],
  },
};

describe("ContentDocumentV3", () => {
  it("projects V2 losslessly and treats its empty-attachment projection as equal", () => {
    const projected = projectContentDocumentV2ToV3(v2);
    expect(projected).toEqual({ ...v2, schemaVersion: 3 });
    expect(contentDocumentsEqual(v2, projected)).toBe(true);
    expect(v2.schemaVersion).toBe(2);
  });

  it("allows Asset IDs only on B-roll and sound cues and extracts them deterministically", () => {
    const assetId = randomUUID();
    const document = contentDocumentV3Schema.parse({
      ...projectContentDocumentV2ToV3(v2),
      script: {
        blocks: [
          {
            ...v2.script.blocks[0],
            editDirections: [
              { ...v2.script.blocks[0].editDirections[0], assetId },
              v2.script.blocks[0].editDirections[1],
            ],
          },
        ],
      },
    });
    expect(extractAssetReferences(document)).toEqual([{ assetId, directionId: brollId }]);
    expect(contentDocumentsEqual(projectContentDocumentV2ToV3(v2), document)).toBe(false);
    expect(
      contentDocumentV3Schema.safeParse({
        ...document,
        script: {
          blocks: [
            {
              ...document.script.blocks[0],
              editDirections: [
                { id: randomUUID(), type: "ZOOM", mode: "in", intensity: "normal", assetId },
              ],
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("does not derive references from historical V1/V2 and rejects unknown schemas", () => {
    expect(extractAssetReferences(v2)).toEqual([]);
    expect(() => contentDocumentV3Schema.parse({ ...v2, schemaVersion: 4 })).toThrow();
  });
});
