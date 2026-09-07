import type { ContentDocument } from "./content-script-contracts";

export type ExtractedAssetReference = Readonly<{ assetId: string; directionId: string }>;

/** Canonical JSON is the authority. V1/V2 deliberately have no Asset projection. */
export function extractAssetReferences(
  document: ContentDocument,
): readonly ExtractedAssetReference[] {
  if (document.schemaVersion !== 3) return [];
  return document.script.blocks.flatMap((block) =>
    block.editDirections.flatMap((direction) =>
      (direction.type === "BROLL_CUE" || direction.type === "SOUND_CUE") && direction.assetId
        ? [{ assetId: direction.assetId, directionId: direction.id }]
        : [],
    ),
  );
}
