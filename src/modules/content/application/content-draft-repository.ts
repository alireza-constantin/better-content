import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { contentDrafts, contents } from "@/db/schema";
import type { ContentScriptDocument } from "../domain";

export type ContentDraftWriter = Pick<typeof db, "select" | "update">;

export type ContentDraftWriteInput = Readonly<{
  workspaceId: string;
  contentId: string;
  baseRevision: number;
  document: ContentScriptDocument;
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
