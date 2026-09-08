import {
  contentDocumentV2Schema,
  contentDocumentV3Schema,
  type ContentDocumentV2,
  type ContentDocumentV3,
  type EditDirection,
  type PerformanceDirection,
} from "../domain";

export type DirectionCategory = "performanceDirections" | "editDirections";
export type ProductionDirection = PerformanceDirection | EditDirection;
export type EditorDocument = ContentDocumentV2 | ContentDocumentV3;

function updateBlock<T extends EditorDocument>(
  document: T,
  blockId: string,
  update: (
    block: ContentDocumentV2["script"]["blocks"][number],
  ) => ContentDocumentV2["script"]["blocks"][number],
): T | null {
  if (!document.script.blocks.some((block) => block.id === blockId)) return null;
  const result = (
    document.schemaVersion === 3 ? contentDocumentV3Schema : contentDocumentV2Schema
  ).safeParse({
    ...document,
    script: {
      blocks: document.script.blocks.map((block) => (block.id === blockId ? update(block) : block)),
    },
  });
  return result.success ? (result.data as T) : null;
}

/**
 * These mutations deliberately validate the complete V2 aggregate. That keeps
 * direction limits, unique IDs, and payload invariants at the canonical domain
 * boundary while preserving the existing whole-document autosave lifecycle.
 */
export function addDirection<T extends EditorDocument>(
  document: T,
  blockId: string,
  category: DirectionCategory,
  direction: ProductionDirection,
): T | null {
  return updateBlock(document, blockId, (block) => ({
    ...block,
    [category]: [...block[category], direction],
  }));
}

export function replaceDirection<T extends EditorDocument>(
  document: T,
  blockId: string,
  category: DirectionCategory,
  direction: ProductionDirection,
): T | null {
  return updateBlock(document, blockId, (block) => ({
    ...block,
    [category]: block[category].map((item) => (item.id === direction.id ? direction : item)),
  }));
}

export function deleteDirection<T extends EditorDocument>(
  document: T,
  blockId: string,
  category: DirectionCategory,
  directionId: string,
): T | null {
  return updateBlock(document, blockId, (block) => ({
    ...block,
    [category]: block[category].filter((direction) => direction.id !== directionId),
  }));
}

export function moveDirection<T extends EditorDocument>(
  document: T,
  blockId: string,
  category: DirectionCategory,
  directionId: string,
  delta: -1 | 1,
): T | null {
  return updateBlock(document, blockId, (block) => {
    const directions = [...block[category]];
    const index = directions.findIndex((direction) => direction.id === directionId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= directions.length) return block;
    [directions[index], directions[target]] = [directions[target], directions[index]];
    return { ...block, [category]: directions };
  });
}

/** Changes only the canonical optional V3 Asset identity on an eligible cue. */
export function setDirectionAsset(
  document: ContentDocumentV3,
  blockId: string,
  directionId: string,
  assetId: string | undefined,
): ContentDocumentV3 | null {
  return updateBlock(document, blockId, (block) => ({
    ...block,
    editDirections: block.editDirections.map((direction) =>
      direction.id === directionId &&
      (direction.type === "BROLL_CUE" || direction.type === "SOUND_CUE")
        ? assetId === undefined
          ? (() => {
              const next = { ...direction } as typeof direction & { assetId?: string };
              delete next.assetId;
              return next;
            })()
          : { ...direction, assetId }
        : direction,
    ),
  }));
}
