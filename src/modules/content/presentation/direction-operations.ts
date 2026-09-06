import {
  contentDocumentV2Schema,
  type ContentDocumentV2,
  type EditDirection,
  type PerformanceDirection,
} from "../domain";

export type DirectionCategory = "performanceDirections" | "editDirections";
export type ProductionDirection = PerformanceDirection | EditDirection;

function updateBlock(
  document: ContentDocumentV2,
  blockId: string,
  update: (
    block: ContentDocumentV2["script"]["blocks"][number],
  ) => ContentDocumentV2["script"]["blocks"][number],
): ContentDocumentV2 | null {
  if (!document.script.blocks.some((block) => block.id === blockId)) return null;
  const result = contentDocumentV2Schema.safeParse({
    ...document,
    script: {
      blocks: document.script.blocks.map((block) => (block.id === blockId ? update(block) : block)),
    },
  });
  return result.success ? result.data : null;
}

/**
 * These mutations deliberately validate the complete V2 aggregate. That keeps
 * direction limits, unique IDs, and payload invariants at the canonical domain
 * boundary while preserving the existing whole-document autosave lifecycle.
 */
export function addDirection(
  document: ContentDocumentV2,
  blockId: string,
  category: DirectionCategory,
  direction: ProductionDirection,
): ContentDocumentV2 | null {
  return updateBlock(document, blockId, (block) => ({
    ...block,
    [category]: [...block[category], direction],
  }));
}

export function replaceDirection(
  document: ContentDocumentV2,
  blockId: string,
  category: DirectionCategory,
  direction: ProductionDirection,
): ContentDocumentV2 | null {
  return updateBlock(document, blockId, (block) => ({
    ...block,
    [category]: block[category].map((item) => (item.id === direction.id ? direction : item)),
  }));
}

export function deleteDirection(
  document: ContentDocumentV2,
  blockId: string,
  category: DirectionCategory,
  directionId: string,
): ContentDocumentV2 | null {
  return updateBlock(document, blockId, (block) => ({
    ...block,
    [category]: block[category].filter((direction) => direction.id !== directionId),
  }));
}

export function moveDirection(
  document: ContentDocumentV2,
  blockId: string,
  category: DirectionCategory,
  directionId: string,
  delta: -1 | 1,
): ContentDocumentV2 | null {
  return updateBlock(document, blockId, (block) => {
    const directions = [...block[category]];
    const index = directions.findIndex((direction) => direction.id === directionId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= directions.length) return block;
    [directions[index], directions[target]] = [directions[target], directions[index]];
    return { ...block, [category]: directions };
  });
}
