import "server-only";

import { and, asc, count, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { contentDnaVersions, contents, ideaGenerationBatches, ideas } from "@/db/schema";

import type { IdeaLibraryStatusFilter } from "./idea-library-service";

export type IdeaLibraryRecord = Readonly<{
  idea: typeof ideas.$inferSelect;
  batch: typeof ideaGenerationBatches.$inferSelect;
  contentDnaVersionNumber: number;
  contentCount: number;
}>;

export async function findOwnedIdeaGenerationBatchId(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  batchId: string,
): Promise<string | null> {
  const [record] = await database
    .select({ id: ideaGenerationBatches.id })
    .from(ideaGenerationBatches)
    .where(
      and(
        eq(ideaGenerationBatches.id, batchId),
        eq(ideaGenerationBatches.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  return record?.id ?? null;
}

export async function listIdeaLibraryRecords(
  database: Pick<typeof db, "select">,
  input: Readonly<{
    workspaceId: string;
    statusFilter: IdeaLibraryStatusFilter;
    generationBatchId: string | null;
  }>,
): Promise<readonly IdeaLibraryRecord[]> {
  const conditions = [eq(ideaGenerationBatches.workspaceId, input.workspaceId)];

  if (input.statusFilter !== "ALL") {
    conditions.push(eq(ideas.status, input.statusFilter));
  }

  if (input.generationBatchId) {
    conditions.push(eq(ideas.batchId, input.generationBatchId));
  }

  const records = await database
    .select({
      idea: ideas,
      batch: ideaGenerationBatches,
      contentDnaVersionNumber: contentDnaVersions.versionNumber,
      contentCount: count(contents.id),
    })
    .from(ideas)
    .innerJoin(ideaGenerationBatches, eq(ideas.batchId, ideaGenerationBatches.id))
    .innerJoin(
      contentDnaVersions,
      eq(ideaGenerationBatches.contentDnaVersionId, contentDnaVersions.id),
    )
    .leftJoin(
      contents,
      and(eq(contents.sourceIdeaId, ideas.id), eq(contents.workspaceId, input.workspaceId)),
    )
    .where(and(...conditions))
    .groupBy(ideas.id, ideaGenerationBatches.id, contentDnaVersions.id)
    .orderBy(
      desc(ideaGenerationBatches.createdAt),
      desc(ideaGenerationBatches.id),
      asc(ideas.position),
    );

  return records.map((record) => ({
    idea: record.idea,
    batch: record.batch,
    contentDnaVersionNumber: record.contentDnaVersionNumber,
    contentCount: Number(record.contentCount),
  }));
}
