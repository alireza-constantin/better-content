import { describe, expect, it } from "vitest";

import type { ContentDocumentV2 } from "../domain";
import {
  addDirection,
  deleteDirection,
  moveDirection,
  replaceDirection,
} from "./direction-operations";

const blockId = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000010";
const document = (): ContentDocumentV2 => ({
  schemaVersion: 2,
  script: {
    blocks: [
      {
        id: blockId,
        type: "paragraph",
        text: "Hello",
        performanceDirections: [],
        editDirections: [],
      },
    ],
  },
});

describe("direction operations", () => {
  it("updates a direction in place and preserves its identity", () => {
    const added = addDirection(document(), blockId, "performanceDirections", {
      id,
      type: "PAUSE",
      duration: "short",
    })!;
    const changed = replaceDirection(added, blockId, "performanceDirections", {
      id,
      type: "PAUSE",
      duration: "long",
    })!;
    expect(changed.script.blocks[0].performanceDirections).toEqual([
      { id, type: "PAUSE", duration: "long" },
    ]);
  });

  it("moves only within its category and deletes explicitly", () => {
    const first = { id, type: "PAUSE" as const, duration: "short" as const };
    const second = {
      id: "00000000-0000-4000-8000-000000000011",
      type: "GAZE" as const,
      target: "camera" as const,
    };
    const withDirections = addDirection(
      addDirection(document(), blockId, "performanceDirections", first)!,
      blockId,
      "performanceDirections",
      second,
    )!;
    const moved = moveDirection(withDirections, blockId, "performanceDirections", second.id, -1)!;
    expect(moved.script.blocks[0].performanceDirections.map((direction) => direction.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(
      deleteDirection(moved, blockId, "performanceDirections", second.id)!.script.blocks[0]
        .performanceDirections,
    ).toEqual([first]);
  });

  it("rejects a document-wide direction limit instead of partially applying", () => {
    const blocks = Array.from({ length: 25 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      type: "paragraph" as const,
      text: "",
      performanceDirections: Array.from({ length: 12 }, (_, offset) => ({
        id: `10000000-0000-4000-8000-${String(index * 12 + offset).padStart(12, "0")}`,
        type: "PAUSE" as const,
        duration: "short" as const,
      })),
      editDirections: [],
    }));
    const full = { schemaVersion: 2 as const, script: { blocks } };
    expect(
      addDirection(full, blocks[0].id, "editDirections", {
        id: "20000000-0000-4000-8000-000000000001",
        type: "CUT",
        style: "hard",
      }),
    ).toBeNull();
  });
});
