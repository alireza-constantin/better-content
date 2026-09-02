import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { ideaGenerationBatches, ideas } from "@/db/schema";

export type IdeaWithOwningBatch = Readonly<{
  idea: typeof ideas.$inferSelect;
  batch: typeof ideaGenerationBatches.$inferSelect;
}>;

export async function findIdeaWithOwningBatchForUpdate(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  ideaId: string,
): Promise<IdeaWithOwningBatch | undefined> {
  const [record] = await database
    .select({ idea: ideas, batch: ideaGenerationBatches })
    .from(ideas)
    .innerJoin(ideaGenerationBatches, eq(ideas.batchId, ideaGenerationBatches.id))
    .where(and(eq(ideas.id, ideaId), eq(ideaGenerationBatches.workspaceId, workspaceId)))
    .for("update");

  return record;
}
