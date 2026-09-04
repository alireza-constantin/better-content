import "server-only";

import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { contentGenerationAttempts, contents, ideaGenerationBatches, ideas } from "@/db/schema";
import { ApplicationError } from "@/lib/errors/app-error";

export type ProductionQueueDatabase = Pick<typeof db, "select">;
export type ProductionQueueWriter = Pick<typeof db, "select" | "update" | "execute">;

export type ProductionQueueAttemptRecord = Readonly<{
  id: string;
  status: string;
  errorCategory: string | null;
  createdAt: Date;
  failedAt: Date | null;
}>;

export type ProductionQueueRecord = Readonly<{
  idea: typeof ideas.$inferSelect;
  lastAttempt: ProductionQueueAttemptRecord | null;
}>;

/**
 * Locks every Idea belonging to a workspace in stable ID order. The caller
 * must acquire the workspace row first. This keeps queue mutations on one
 * deterministic workspace serialization boundary.
 */
export async function lockWorkspaceIdeasForQueueMutation(
  database: ProductionQueueWriter,
  workspaceId: string,
): Promise<void> {
  await database
    .select({ id: ideas.id })
    .from(ideas)
    .innerJoin(ideaGenerationBatches, eq(ideaGenerationBatches.id, ideas.batchId))
    .where(eq(ideaGenerationBatches.workspaceId, workspaceId))
    .orderBy(asc(ideas.id))
    .for("update");
}

export async function listProductionQueueRecords(
  database: ProductionQueueDatabase,
  workspaceId: string,
): Promise<readonly ProductionQueueRecord[]> {
  const queuedIdeas = await database
    .select({ idea: ideas, linkedContentCount: count(contents.id) })
    .from(ideas)
    .innerJoin(ideaGenerationBatches, eq(ideaGenerationBatches.id, ideas.batchId))
    .leftJoin(
      contents,
      and(eq(contents.sourceIdeaId, ideas.id), eq(contents.workspaceId, workspaceId)),
    )
    .where(and(eq(ideaGenerationBatches.workspaceId, workspaceId), eq(ideas.status, "ACCEPTED")))
    .groupBy(ideas.id)
    .having(sql`count(${contents.id}) = 0`)
    .orderBy(asc(ideas.productionQueuePosition), asc(ideas.id));

  if (queuedIdeas.length === 0) {
    return [];
  }

  const attempts = await database
    .select({
      id: contentGenerationAttempts.id,
      sourceIdeaId: contentGenerationAttempts.sourceIdeaId,
      status: contentGenerationAttempts.status,
      errorCategory: contentGenerationAttempts.errorCategory,
      createdAt: contentGenerationAttempts.createdAt,
      failedAt: contentGenerationAttempts.failedAt,
    })
    .from(contentGenerationAttempts)
    .innerJoin(ideas, eq(ideas.id, contentGenerationAttempts.sourceIdeaId))
    .innerJoin(
      ideaGenerationBatches,
      and(
        eq(ideaGenerationBatches.id, ideas.batchId),
        eq(ideaGenerationBatches.workspaceId, workspaceId),
      ),
    )
    .where(eq(contentGenerationAttempts.workspaceId, workspaceId))
    .orderBy(desc(contentGenerationAttempts.createdAt), desc(contentGenerationAttempts.id));

  // The source Idea is already workspace-provenanced by the queue query. The
  // attempts are only compact activity metadata; never expose their private
  // request/instruction fields from this read model.
  const latestAttemptByIdea = new Map<string, ProductionQueueAttemptRecord>();
  for (const attempt of attempts) {
    if (!latestAttemptByIdea.has(attempt.sourceIdeaId)) {
      latestAttemptByIdea.set(attempt.sourceIdeaId, attempt);
    }
  }

  return queuedIdeas.map(({ idea }) => ({
    idea,
    lastAttempt: latestAttemptByIdea.get(idea.id) ?? null,
  }));
}

function requirePositivePosition(position: number | null, ideaId: string): number {
  if (position === null || position <= 0) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      `The queued Idea ${ideaId} has an invalid production position.`,
    );
  }

  return position;
}

export async function appendIdeaToProductionQueueInTransaction(
  database: ProductionQueueWriter,
  workspaceId: string,
  ideaId: string,
): Promise<void> {
  await lockWorkspaceIdeasForQueueMutation(database, workspaceId);
  const currentQueue = await listProductionQueueRecords(database, workspaceId);
  const otherQueueItems = currentQueue.filter((record) => record.idea.id !== ideaId);
  const highestPosition = otherQueueItems.reduce(
    (highest, record) =>
      Math.max(
        highest,
        requirePositivePosition(record.idea.productionQueuePosition, record.idea.id),
      ),
    0,
  );

  const [updatedIdea] = await database
    .update(ideas)
    .set({ productionQueuePosition: highestPosition + 1 })
    .where(eq(ideas.id, ideaId))
    .returning({ id: ideas.id });

  if (!updatedIdea) {
    throw new ApplicationError("INTERNAL_ERROR", "The Idea queue position was not assigned.");
  }
}

export async function clearIdeaProductionQueuePositionInTransaction(
  database: ProductionQueueWriter,
  workspaceId: string,
  ideaId: string,
): Promise<void> {
  await lockWorkspaceIdeasForQueueMutation(database, workspaceId);
  await database.update(ideas).set({ productionQueuePosition: null }).where(eq(ideas.id, ideaId));
}

export async function normalizeProductionQueuePositionsInTransaction(
  database: ProductionQueueWriter,
  workspaceId: string,
): Promise<void> {
  await lockWorkspaceIdeasForQueueMutation(database, workspaceId);
  const currentQueue = await listProductionQueueRecords(database, workspaceId);

  for (const [index, record] of currentQueue.entries()) {
    requirePositivePosition(record.idea.productionQueuePosition, record.idea.id);
    const desiredPosition = index + 1;

    if (record.idea.productionQueuePosition === desiredPosition) {
      continue;
    }

    await database
      .update(ideas)
      .set({ productionQueuePosition: desiredPosition })
      .where(eq(ideas.id, record.idea.id));
  }
}

export async function rewriteProductionQueuePositionsInTransaction(
  database: ProductionQueueWriter,
  orderedIdeaIds: readonly string[],
): Promise<void> {
  for (const [index, ideaId] of orderedIdeaIds.entries()) {
    await database
      .update(ideas)
      .set({ productionQueuePosition: index + 1 })
      .where(eq(ideas.id, ideaId));
  }
}
