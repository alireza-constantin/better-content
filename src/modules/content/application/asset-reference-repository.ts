import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { assetReferences, assets } from "@/db/schema";
import { ApplicationError } from "@/lib/errors/app-error";
import { assetMediaTypeIsCompatible } from "@/modules/assets/domain";
import { extractAssetReferences, type ContentDocument } from "../domain";

type AssetReferenceWriter = Pick<typeof db, "delete" | "insert">;

/** Replaces only a canonical artifact's derived rows; callers keep this inside their Draft/Version transaction. */
export async function reconcileAssetReferencesForArtifact(
  database: AssetReferenceWriter,
  input: Readonly<{
    workspaceId: string;
    contentId: string;
    artifactKind: "DRAFT" | "VERSION";
    versionId?: string;
    document: ContentDocument;
  }>,
): Promise<void> {
  await database
    .delete(assetReferences)
    .where(
      and(
        eq(assetReferences.contentId, input.contentId),
        eq(assetReferences.artifactKind, input.artifactKind),
        input.artifactKind === "VERSION"
          ? eq(assetReferences.versionId, input.versionId!)
          : isNull(assetReferences.versionId),
      ),
    );
  const references = extractAssetReferences(input.document);
  if (references.length)
    await database.insert(assetReferences).values(
      references.map((reference) => ({
        workspaceId: input.workspaceId,
        contentId: input.contentId,
        artifactKind: input.artifactKind,
        versionId: input.artifactKind === "VERSION" ? input.versionId! : null,
        ...reference,
      })),
    );
}

/** Authoritative persistence-boundary check: JSON shape alone cannot prove READY workspace media. */
export async function validateReferencedAssets(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  document: ContentDocument,
): Promise<void> {
  const references = extractAssetReferences(document);
  if (!references.length) return;
  const rows = await database
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.workspaceId, workspaceId),
        inArray(
          assets.id,
          references.map((reference) => reference.assetId),
        ),
      ),
    );
  if (rows.length !== new Set(references.map((reference) => reference.assetId)).size)
    throw new ApplicationError("VALIDATION_ERROR", "A referenced Asset is unavailable.");
  for (const reference of references) {
    const asset = rows.find((row) => row.id === reference.assetId);
    const direction =
      document.schemaVersion === 3
        ? document.script.blocks
            .flatMap((block) => block.editDirections)
            .find((candidate) => candidate.id === reference.directionId)
        : undefined;
    if (
      !asset ||
      asset.status !== "READY" ||
      !direction ||
      (direction.type !== "BROLL_CUE" && direction.type !== "SOUND_CUE") ||
      !assetMediaTypeIsCompatible(direction.type, asset.mediaType as "IMAGE" | "VIDEO" | "AUDIO")
    )
      throw new ApplicationError(
        "VALIDATION_ERROR",
        "A referenced Asset is incompatible or not ready.",
      );
  }
}
