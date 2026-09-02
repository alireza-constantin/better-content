import "server-only";

import { and, asc, count, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { contentDnaVersions, ideaGenerationBatches, ideas } from "@/db/schema";

export type IdeaGenerationBatchHistoryRecord = Readonly<{
  batch: typeof ideaGenerationBatches.$inferSelect;
  contentDnaVersionNumber: number;
  ideaCount: number;
}>;

export type IdeaGenerationBatchDetailRecord = Readonly<
  IdeaGenerationBatchHistoryRecord & {
    ideas: readonly (typeof ideas.$inferSelect)[];
  }
>;

export async function listIdeaGenerationBatchHistory(
  database: Pick<typeof db, "select">,
  workspaceId: string,
): Promise<readonly IdeaGenerationBatchHistoryRecord[]> {
  const records = await database
    .select({
      batch: ideaGenerationBatches,
      contentDnaVersionNumber: contentDnaVersions.versionNumber,
      ideaCount: count(ideas.id),
    })
    .from(ideaGenerationBatches)
    .innerJoin(
      contentDnaVersions,
      eq(ideaGenerationBatches.contentDnaVersionId, contentDnaVersions.id),
    )
    .leftJoin(ideas, eq(ideas.batchId, ideaGenerationBatches.id))
    .where(eq(ideaGenerationBatches.workspaceId, workspaceId))
    .groupBy(ideaGenerationBatches.id, contentDnaVersions.id)
    .orderBy(desc(ideaGenerationBatches.createdAt), desc(ideaGenerationBatches.id));

  return records.map((record) => ({
    batch: record.batch,
    contentDnaVersionNumber: record.contentDnaVersionNumber,
    ideaCount: Number(record.ideaCount),
  }));
}

export async function findIdeaGenerationBatchDetail(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  batchId: string,
): Promise<IdeaGenerationBatchDetailRecord | undefined> {
  const [record] = await database
    .select({
      batch: ideaGenerationBatches,
      contentDnaVersionNumber: contentDnaVersions.versionNumber,
      ideaCount: count(ideas.id),
    })
    .from(ideaGenerationBatches)
    .innerJoin(
      contentDnaVersions,
      eq(ideaGenerationBatches.contentDnaVersionId, contentDnaVersions.id),
    )
    .leftJoin(ideas, eq(ideas.batchId, ideaGenerationBatches.id))
    .where(
      and(
        eq(ideaGenerationBatches.workspaceId, workspaceId),
        eq(ideaGenerationBatches.id, batchId),
      ),
    )
    .groupBy(ideaGenerationBatches.id, contentDnaVersions.id);

  if (!record) {
    return undefined;
  }

  const batchIdeas = await database
    .select()
    .from(ideas)
    .where(eq(ideas.batchId, batchId))
    .orderBy(asc(ideas.position));

  return {
    batch: record.batch,
    contentDnaVersionNumber: record.contentDnaVersionNumber,
    ideaCount: Number(record.ideaCount),
    ideas: batchIdeas,
  };
}
