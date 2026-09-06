import { contentDocumentV2Schema, type ContentDocumentV2 } from "../domain";

type Block = ContentDocumentV2["script"]["blocks"][number];
const freshBlock = (text = ""): Block => ({
  id: crypto.randomUUID(),
  type: "paragraph",
  text,
  performanceDirections: [],
  editDirections: [],
});
// Local editing retains a blank active paragraph; the save service is the canonical persistence boundary.
const update = (
  document: ContentDocumentV2,
  blocks: readonly Block[],
): ContentDocumentV2 | null => {
  try {
    return contentDocumentV2Schema.parse({
      ...document,
      script: { blocks: blocks.length ? blocks : [freshBlock()] },
    });
  } catch {
    return null;
  }
};

export function replaceBlockText(
  document: ContentDocumentV2,
  id: string,
  text: string,
): ContentDocumentV2 | null {
  return update(
    document,
    document.script.blocks.map((block) =>
      block.id === id ? { ...block, text: text.replace(/[\r\n]/g, "") } : block,
    ),
  );
}
export function splitBlock(
  document: ContentDocumentV2,
  id: string,
  start: number,
  end: number,
): ContentDocumentV2 | null {
  const index = document.script.blocks.findIndex((block) => block.id === id);
  if (index < 0 || document.script.blocks.length >= 1000) return null;
  const block = document.script.blocks[index];
  const leading = { ...block, text: block.text.slice(0, start) };
  const trailing = freshBlock(block.text.slice(end));
  return update(document, [
    ...document.script.blocks.slice(0, index),
    leading,
    trailing,
    ...document.script.blocks.slice(index + 1),
  ]);
}
export function mergeBlock(document: ContentDocumentV2, id: string): ContentDocumentV2 | null {
  const index = document.script.blocks.findIndex((block) => block.id === id);
  if (index <= 0) return null;
  const previous = document.script.blocks[index - 1];
  const current = document.script.blocks[index];
  const merged: Block = {
    ...previous,
    text: previous.text + current.text,
    performanceDirections: [...previous.performanceDirections, ...current.performanceDirections],
    editDirections: [...previous.editDirections, ...current.editDirections],
  };
  return update(document, [
    ...document.script.blocks.slice(0, index - 1),
    merged,
    ...document.script.blocks.slice(index + 1),
  ]);
}
export function addBlock(document: ContentDocumentV2): ContentDocumentV2 | null {
  return document.script.blocks.length >= 1000
    ? null
    : update(document, [...document.script.blocks, freshBlock()]);
}
export function moveBlock(
  document: ContentDocumentV2,
  id: string,
  delta: -1 | 1,
): ContentDocumentV2 | null {
  const index = document.script.blocks.findIndex((block) => block.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= document.script.blocks.length) return null;
  const blocks = [...document.script.blocks];
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  return update(document, blocks);
}
export function deleteBlock(document: ContentDocumentV2, id: string): ContentDocumentV2 | null {
  const index = document.script.blocks.findIndex((block) => block.id === id);
  if (index < 0) return null;
  return update(
    document,
    document.script.blocks.filter((block) => block.id !== id),
  );
}

/** Multiline paste is structural: only retained lines create new blocks. */
export function pasteIntoBlock(
  document: ContentDocumentV2,
  id: string,
  start: number,
  end: number,
  pasted: string,
): ContentDocumentV2 | null {
  const index = document.script.blocks.findIndex((block) => block.id === id);
  if (index < 0) return null;
  const lines = pasted.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length < 2)
    return replaceBlockText(
      document,
      id,
      document.script.blocks[index].text.slice(0, start) +
        pasted +
        document.script.blocks[index].text.slice(end),
    );
  const retained = lines.filter((line) => !/^\s*$/u.test(line));
  const block = document.script.blocks[index];
  const prefix = block.text.slice(0, start);
  const suffix = block.text.slice(end);
  if (!retained.length) return replaceBlockText(document, id, prefix + suffix);
  if (document.script.blocks.length + retained.length - 1 > 1000) return null;
  const first = { ...block, text: prefix + retained[0] };
  const following = retained.slice(1).map((line) => freshBlock(line));
  const last = following.at(-1);
  if (last) last.text += suffix;
  else first.text += suffix;
  return update(document, [
    ...document.script.blocks.slice(0, index),
    first,
    ...following,
    ...document.script.blocks.slice(index + 1),
  ]);
}
