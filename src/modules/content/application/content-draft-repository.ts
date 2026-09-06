import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { contentDrafts, contentVersions, contents } from "@/db/schema";
import type { ContentDocument } from "../domain";

export type ContentDraftWriter = Pick<typeof db, "select" | "update">;

export type ContentDraftWriteInput = Readonly<{
  workspaceId: string;
  contentId: string;
  baseRevision: number;
  document: ContentDocument;
  updatedAt: Date;
}>;

export type ContentDraftWriteTarget = Readonly<{
  contentId: string;
  revision: number;
}>;

/**
 * Advances a Draft only when the caller owns the Content workspace and still
 * holds the current revision. The returned row is the database's proof that
 * this save won the optimistic-concurrency race.
 */
export async function updateContentDraftIfRevisionMatches(
  database: ContentDraftWriter,
  input: ContentDraftWriteInput,
): Promise<typeof contentDrafts.$inferSelect | undefined> {
  const contentInWorkspace = database
    .select({ id: contents.id })
    .from(contents)
    .where(and(eq(contents.id, input.contentId), eq(contents.workspaceId, input.workspaceId)));

  const [draft] = await database
    .update(contentDrafts)
    .set({
      document: input.document,
      revision: sql`${contentDrafts.revision} + 1`,
      updatedAt: input.updatedAt,
    })
    .where(
      and(
        eq(contentDrafts.contentId, input.contentId),
        eq(contentDrafts.revision, input.baseRevision),
        inArray(contentDrafts.contentId, contentInWorkspace),
      ),
    )
    .returning();

  return draft;
}

export type LockedContentDraftWriteTarget = Readonly<{
  draft: typeof contentDrafts.$inferSelect;
}>;

/** Locks the Content row (the per-Content Version allocation mutex) and its Draft. */
export async function lockContentDraftWriteTarget(
  database: Pick<typeof db, "execute" | "select">,
  workspaceId: string,
  contentId: string,
): Promise<LockedContentDraftWriteTarget | undefined> {
  await database.execute(sql`
    select ${contents.id}
    from ${contents}
    inner join ${contentDrafts} on ${eq(contentDrafts.contentId, contents.id)}
    where ${and(eq(contents.workspaceId, workspaceId), eq(contents.id, contentId))}
    for update of ${contents}, ${contentDrafts}
  `);

  const [target] = await database
    .select({ draft: contentDrafts })
    .from(contents)
    .innerJoin(contentDrafts, eq(contentDrafts.contentId, contents.id))
    .where(and(eq(contents.workspaceId, workspaceId), eq(contents.id, contentId)));

  return target;
}

export async function createLegacyDraftCheckpoint(
  database: Pick<typeof db, "select" | "insert">,
  input: Readonly<{
    contentId: string;
    document: ContentDocument;
    createdByUserId: string;
  }>,
): Promise<void> {
  const [lastVersion] = await database
    .select({ versionNumber: contentVersions.versionNumber })
    .from(contentVersions)
    .where(eq(contentVersions.contentId, input.contentId))
    .orderBy(desc(contentVersions.versionNumber))
    .limit(1);

  await database.insert(contentVersions).values({
    contentId: input.contentId,
    versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
    // This is the stored V1 JSONB value, never a reconstructed V2 projection.
    document: input.document,
    source: "LEGACY_DRAFT_CHECKPOINT",
    aiRunId: null,
    createdByUserId: input.createdByUserId,
  });
}

export async function hasLegacyDraftCheckpoint(
  database: Pick<typeof db, "select">,
  contentId: string,
): Promise<boolean> {
  const [checkpoint] = await database
    .select({ id: contentVersions.id })
    .from(contentVersions)
    .where(
      and(
        eq(contentVersions.contentId, contentId),
        eq(contentVersions.source, "LEGACY_DRAFT_CHECKPOINT"),
      ),
    )
    .limit(1);

  return checkpoint !== undefined;
}

/**
 * Reads only the workspace-scoped write target after a conditional update
 * affects no row. This distinguishes a stale revision from a nondisclosing
 * missing/foreign Content without ever authorizing through a client ID.
 */
export async function findContentDraftWriteTarget(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  contentId: string,
): Promise<ContentDraftWriteTarget | undefined> {
  const [target] = await database
    .select({ contentId: contents.id, revision: contentDrafts.revision })
    .from(contents)
    .innerJoin(contentDrafts, eq(contentDrafts.contentId, contents.id))
    .where(and(eq(contents.workspaceId, workspaceId), eq(contents.id, contentId)));

  return target;
}
