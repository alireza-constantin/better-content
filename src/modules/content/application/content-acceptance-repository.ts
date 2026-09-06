import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { contentDrafts, contentVersions, contents } from "@/db/schema";
import type { ContentVersionSource } from "../domain";

export type ContentAcceptanceWriter = Pick<typeof db, "execute" | "select" | "insert" | "update">;

export type LockedContentAcceptanceTarget = Readonly<{
  content: typeof contents.$inferSelect;
  draft: typeof contentDrafts.$inferSelect;
}>;

/**
 * The Content row is the per-aggregate mutex for Version numbering and the
 * Draft is locked with it so saves and acceptance observe one revision order.
 */
export async function lockContentForAcceptance(
  database: ContentAcceptanceWriter,
  workspaceId: string,
  contentId: string,
): Promise<LockedContentAcceptanceTarget | undefined> {
  await database.execute(sql`
    select ${contents.id}
    from ${contents}
    inner join ${contentDrafts} on ${eq(contentDrafts.contentId, contents.id)}
    where ${and(eq(contents.workspaceId, workspaceId), eq(contents.id, contentId))}
    for update of ${contents}, ${contentDrafts}
  `);

  const [target] = await database
    .select({ content: contents, draft: contentDrafts })
    .from(contents)
    .innerJoin(contentDrafts, eq(contentDrafts.contentId, contents.id))
    .where(and(eq(contents.workspaceId, workspaceId), eq(contents.id, contentId)));

  return target;
}

export async function findAcceptedContentVersion(
  database: Pick<typeof db, "select">,
  contentId: string,
  versionId: string | null,
): Promise<typeof contentVersions.$inferSelect | undefined> {
  if (!versionId) return undefined;

  const [version] = await database
    .select()
    .from(contentVersions)
    .where(and(eq(contentVersions.contentId, contentId), eq(contentVersions.id, versionId)));

  return version;
}

export async function nextContentVersionNumber(
  database: Pick<typeof db, "select">,
  contentId: string,
): Promise<number> {
  const [lastVersion] = await database
    .select({ versionNumber: contentVersions.versionNumber })
    .from(contentVersions)
    .where(eq(contentVersions.contentId, contentId))
    .orderBy(desc(contentVersions.versionNumber))
    .limit(1);

  return (lastVersion?.versionNumber ?? 0) + 1;
}

export async function createImmutableContentVersion(
  database: Pick<typeof db, "insert">,
  input: Readonly<{
    contentId: string;
    versionNumber: number;
    document: typeof contentVersions.$inferInsert.document;
    source: ContentVersionSource;
    aiRunId?: string | null;
    createdByUserId: string;
    createdAt: Date;
  }>,
): Promise<typeof contentVersions.$inferSelect> {
  const [version] = await database
    .insert(contentVersions)
    .values({
      contentId: input.contentId,
      versionNumber: input.versionNumber,
      document: input.document,
      source: input.source,
      aiRunId: input.aiRunId ?? null,
      createdByUserId: input.createdByUserId,
      createdAt: input.createdAt,
    })
    .returning();

  if (!version) throw new Error("The accepted Content Version was not created.");
  return version;
}

export async function createContentAcceptanceVersion(
  database: Pick<typeof db, "insert">,
  input: Readonly<{
    contentId: string;
    versionNumber: number;
    document: typeof contentVersions.$inferInsert.document;
    createdByUserId: string;
    createdAt: Date;
  }>,
): Promise<typeof contentVersions.$inferSelect> {
  return createImmutableContentVersion(database, { ...input, source: "CREATOR_ACCEPTED" });
}

export async function updateContentDraftForLegacyAcceptance(
  database: Pick<typeof db, "update">,
  input: Readonly<{
    contentId: string;
    expectedRevision: number;
    document: typeof contentDrafts.$inferInsert.document;
    updatedAt: Date;
  }>,
): Promise<typeof contentDrafts.$inferSelect | undefined> {
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
        eq(contentDrafts.revision, input.expectedRevision),
      ),
    )
    .returning();

  return draft;
}

export async function setAcceptedContentVersion(
  database: Pick<typeof db, "update">,
  contentId: string,
  versionId: string,
): Promise<typeof contents.$inferSelect | undefined> {
  const [content] = await database
    .update(contents)
    .set({ acceptedVersionId: versionId })
    .where(eq(contents.id, contentId))
    .returning();

  return content;
}
