import { describe, expect, it } from "vitest";
import type { ContentDocumentV2 } from "../domain";
import { mergeBlock, pasteIntoBlock, splitBlock } from "./script-block-operations";

const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
const doc = (
  blocks: ContentDocumentV2["script"]["blocks"] = [
    { id: ids[0], type: "paragraph", text: "Hello", performanceDirections: [], editDirections: [] },
  ],
) => ({ schemaVersion: 2 as const, script: { blocks } });
describe("script block operations", () => {
  it("splits without moving source directions", () => {
    const source = doc([
      {
        id: ids[0],
        type: "paragraph",
        text: "Hello",
        performanceDirections: [
          { id: "00000000-0000-4000-8000-000000000010", type: "PAUSE", duration: "short" },
        ],
        editDirections: [],
      },
    ]);
    const result = splitBlock(source, ids[0], 2, 2)!;
    expect(result.script.blocks.map((block) => block.text)).toEqual(["He", "llo"]);
    expect(result.script.blocks[0].performanceDirections).toHaveLength(1);
    expect(result.script.blocks[1].performanceDirections).toEqual([]);
  });
  it("merges and transfers direction arrays in order", () => {
    const result = mergeBlock(
      doc([
        { id: ids[0], type: "paragraph", text: "A", performanceDirections: [], editDirections: [] },
        {
          id: ids[1],
          type: "paragraph",
          text: "B",
          performanceDirections: [
            { id: "00000000-0000-4000-8000-000000000011", type: "PAUSE", duration: "short" },
          ],
          editDirections: [],
        },
      ]),
      ids[1],
    )!;
    expect(result.script.blocks[0].text).toBe("AB");
    expect(result.script.blocks[0].performanceDirections[0].id).toBe(
      "00000000-0000-4000-8000-000000000011",
    );
  });
  it("segments multiline paste and discards whitespace-only lines", () => {
    const result = pasteIntoBlock(doc(), ids[0], 5, 5, " one\n  \nTwo")!;
    expect(result.script.blocks.map((block) => block.text)).toEqual(["Hello one", "Two"]);
  });
});
