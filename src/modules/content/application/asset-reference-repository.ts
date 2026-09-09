import "server-only";

import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { assetReferences, assets, contentDrafts, contentVersions, contents } from "@/db/schema";
import { ApplicationError } from "@/lib/errors/app-error";
import { assetMediaTypeIsCompatible } from "@/modules/assets/domain";
import { contentDocumentSchema, extractAssetReferences, type ContentDocument } from "../domain";

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
  // The enclosing Draft/acceptance transaction holds every referenced Asset
  // lock in sorted identity order. This serializes attach/delete races: a
  // delete that won first is observed as DELETING, while an attachment that
  // won first projects a surviving reference before deletion can proceed.
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
    )
    .orderBy(asc(assets.id))
    .for("update");
  if (rows.length !== new Set(references.map((reference) => reference.assetId)).size)
    throw new ApplicationError("VALIDATION_ERROR", "A referenced Asset is unavailable.");
  for (const reference of references) {
    const asset = rows.find((row) => row.id === reference.assetId);
    const direction =
      document.schemaVersion === 3 || document.schemaVersion === 4
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

/** Counts distinct Contents, not direction rows, across Draft and Version projections. */
export async function countAssetContentReferences(
  database: Pick<typeof db, "select">,
  input: Readonly<{ workspaceId: string; assetId: string }>,
): Promise<number> {
  const [result] = await database
    .select({ count: sql<number>`count(distinct ${assetReferences.contentId})` })
    .from(assetReferences)
    .where(
      and(
        eq(assetReferences.workspaceId, input.workspaceId),
        eq(assetReferences.assetId, input.assetId),
      ),
    );

  return Number(result?.count ?? 0);
}

export type AssetReferenceRebuildCursor = Readonly<{
  artifactKind: "DRAFT" | "VERSION";
  afterId: string | null;
}>;

export type AssetReferenceRebuildBatchResult = Readonly<{
  processed: number;
  nextCursor: AssetReferenceRebuildCursor | null;
}>;

type RebuildDatabase = Pick<typeof db, "select" | "transaction">;
type RebuildTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type RebuildArtifact = Readonly<{
  workspaceId: string;
  contentId: string;
  artifactKind: "DRAFT" | "VERSION";
  versionId?: string;
  document: unknown;
  id: string;
}>;

async function loadDraftRebuildArtifacts(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  afterId: string | null,
  limit: number,
): Promise<readonly RebuildArtifact[]> {
  const rows = await database
    .select({
      workspaceId: contents.workspaceId,
      contentId: contents.id,
      document: contentDrafts.document,
    })
    .from(contentDrafts)
    .innerJoin(contents, eq(contents.id, contentDrafts.contentId))
    .where(
      afterId
        ? and(eq(contents.workspaceId, workspaceId), gt(contents.id, afterId))
        : eq(contents.workspaceId, workspaceId),
    )
    .orderBy(asc(contents.id))
    .limit(limit);

  return rows.map((row) => ({ ...row, artifactKind: "DRAFT", id: row.contentId }));
}

async function loadVersionRebuildArtifacts(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  afterId: string | null,
  limit: number,
): Promise<readonly RebuildArtifact[]> {
  const rows = await database
    .select({
      workspaceId: contents.workspaceId,
      contentId: contents.id,
      versionId: contentVersions.id,
      document: contentVersions.document,
    })
    .from(contentVersions)
    .innerJoin(contents, eq(contents.id, contentVersions.contentId))
    .where(
      afterId
        ? and(eq(contents.workspaceId, workspaceId), gt(contentVersions.id, afterId))
        : eq(contents.workspaceId, workspaceId),
    )
    .orderBy(asc(contentVersions.id))
    .limit(limit);

  return rows.map((row) => ({ ...row, artifactKind: "VERSION", id: row.versionId }));
}

function parseRebuildDocument(value: unknown): ContentDocument {
  const result = contentDocumentSchema.safeParse(value);
  if (!result.success)
    throw new ApplicationError("INTERNAL_ERROR", "A Content artifact document is invalid.");
  return result.data;
}

/**
 * Repairs a bounded batch of the derived Asset-reference projection. The
 * caller owns cursor progression; every selected artifact and its replacement
 * rows are reconciled in one short PostgreSQL transaction.
 */
export async function rebuildAssetReferencesBatch(
  database: RebuildDatabase,
  input: Readonly<{
    workspaceId: string;
    limit?: number;
    cursor?: AssetReferenceRebuildCursor | null;
  }>,
): Promise<AssetReferenceRebuildBatchResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
  return database.transaction(async (transaction: RebuildTransaction) => {
    const cursor = input.cursor ?? { artifactKind: "DRAFT", afterId: null };
    const artifacts: RebuildArtifact[] = [];
    let nextCursor: AssetReferenceRebuildCursor | null = null;

    if (cursor.artifactKind === "DRAFT") {
      const drafts = await loadDraftRebuildArtifacts(
        transaction,
        input.workspaceId,
        cursor.afterId,
        limit,
      );
      artifacts.push(...drafts);
      if (drafts.length === limit) {
        nextCursor = { artifactKind: "DRAFT", afterId: drafts.at(-1)!.id };
      } else {
        const versions = await loadVersionRebuildArtifacts(
          transaction,
          input.workspaceId,
          null,
          limit - drafts.length,
        );
        artifacts.push(...versions);
        if (versions.length === limit - drafts.length && versions.length > 0)
          nextCursor = { artifactKind: "VERSION", afterId: versions.at(-1)!.id };
      }
    } else {
      const versions = await loadVersionRebuildArtifacts(
        transaction,
        input.workspaceId,
        cursor.afterId,
        limit,
      );
      artifacts.push(...versions);
      if (versions.length === limit)
        nextCursor = { artifactKind: "VERSION", afterId: versions.at(-1)!.id };
    }

    for (const artifact of artifacts) {
      await reconcileAssetReferencesForArtifact(transaction, {
        workspaceId: artifact.workspaceId,
        contentId: artifact.contentId,
        artifactKind: artifact.artifactKind,
        ...(artifact.artifactKind === "VERSION" ? { versionId: artifact.versionId } : {}),
        document: parseRebuildDocument(artifact.document),
      });
    }

    return { processed: artifacts.length, nextCursor };
  });
}
