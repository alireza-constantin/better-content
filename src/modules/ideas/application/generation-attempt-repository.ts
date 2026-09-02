import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  aiRuns,
  ideas,
  ideaGenerationBatches,
  workspaceGenerationQuotaReservations,
} from "@/db/schema";
import { ApplicationError } from "@/lib/errors/app-error";
import { failureCategorySchema, generationLifecycleSchema } from "@/modules/ai/domain/ai-contracts";
import type {
  FailureCategory,
  GenerationPair,
  GenerationWriter,
  GenerationInvocationResult,
  GenerationCompletionResult,
  SuccessfulGenerationResult,
} from "./generation-types";

const STALE_ATTEMPT_MS = 75_000;

export function parseStoredErrorCategory(value: string | null): FailureCategory | null {
  if (value === null) {
    return null;
  }

  const result = failureCategorySchema.safeParse(value);

  if (!result.success) {
    throw new ApplicationError("INTERNAL_ERROR", "The generation failure state is invalid.");
  }

  return result.data;
}

export function parseStoredBatchStatus(value: string) {
  const result = generationLifecycleSchema.safeParse(value);

  if (!result.success) {
    throw new ApplicationError("INTERNAL_ERROR", "The generation lifecycle state is invalid.");
  }

  return result.data;
}

export async function lockGenerationWorkspace(
  database: GenerationWriter,
  workspaceId: string,
): Promise<void> {
  await database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`);
}

async function lockPair(
  database: GenerationWriter,
  workspaceId: string,
  batchId: string,
  runId: string,
): Promise<GenerationPair | undefined> {
  const [batch] = await database
    .select()
    .from(ideaGenerationBatches)
    .where(
      and(
        eq(ideaGenerationBatches.id, batchId),
        eq(ideaGenerationBatches.workspaceId, workspaceId),
      ),
    )
    .for("update");

  if (!batch) {
    return undefined;
  }

  const [run] = await database
    .select()
    .from(aiRuns)
    .where(and(eq(aiRuns.id, runId), eq(aiRuns.workspaceId, workspaceId)))
    .for("update");

  return run ? { batch, run } : undefined;
}

async function releaseReservation(
  database: GenerationWriter,
  workspaceId: string,
  batchId: string,
  releasedAt: Date,
): Promise<void> {
  await database
    .update(workspaceGenerationQuotaReservations)
    .set({ releasedAt })
    .where(
      and(
        eq(workspaceGenerationQuotaReservations.workspaceId, workspaceId),
        eq(workspaceGenerationQuotaReservations.batchId, batchId),
        isNull(workspaceGenerationQuotaReservations.invokedAt),
        isNull(workspaceGenerationQuotaReservations.releasedAt),
      ),
    );
}

async function failPair(
  database: GenerationWriter,
  pair: GenerationPair,
  category: FailureCategory,
  failedAt: Date,
): Promise<GenerationPair> {
  if (
    (pair.batch.status !== "PENDING" && pair.batch.status !== "RUNNING") ||
    (pair.run.status !== "PENDING" && pair.run.status !== "RUNNING")
  ) {
    return pair;
  }

  const expectedBatchStatus = pair.batch.status;
  const expectedRunStatus = pair.run.status;

  if (expectedBatchStatus !== expectedRunStatus) {
    throw new ApplicationError("INTERNAL_ERROR", "The generation lifecycle pair is inconsistent.");
  }

  const [updatedRun] = await database
    .update(aiRuns)
    .set({ status: "FAILED", errorCategory: category, failedAt })
    .where(and(eq(aiRuns.id, pair.run.id), eq(aiRuns.status, expectedRunStatus)))
    .returning();
  const [updatedBatch] = await database
    .update(ideaGenerationBatches)
    .set({ status: "FAILED", errorCategory: category, failedAt })
    .where(
      and(
        eq(ideaGenerationBatches.id, pair.batch.id),
        eq(ideaGenerationBatches.status, expectedBatchStatus),
      ),
    )
    .returning();

  if (!updatedRun || !updatedBatch) {
    throw new ApplicationError("INTERNAL_ERROR", "The generation failure update was not applied.");
  }

  if (expectedBatchStatus === "PENDING") {
    await releaseReservation(database, pair.batch.workspaceId, pair.batch.id, failedAt);
  }

  return { batch: updatedBatch, run: updatedRun };
}

export async function recoverStaleAttemptsInTransaction(
  database: GenerationWriter,
  workspaceId: string,
  recoveredAt: Date,
): Promise<number> {
  const cutoff = new Date(recoveredAt.getTime() - STALE_ATTEMPT_MS);
  const candidates = await database
    .select({ batch: ideaGenerationBatches, run: aiRuns })
    .from(ideaGenerationBatches)
    .innerJoin(aiRuns, eq(ideaGenerationBatches.aiRunId, aiRuns.id))
    .where(
      and(
        eq(ideaGenerationBatches.workspaceId, workspaceId),
        or(
          and(
            eq(ideaGenerationBatches.status, "PENDING"),
            eq(aiRuns.status, "PENDING"),
            lte(ideaGenerationBatches.createdAt, cutoff),
          ),
          and(
            eq(ideaGenerationBatches.status, "RUNNING"),
            eq(aiRuns.status, "RUNNING"),
            lte(ideaGenerationBatches.startedAt, cutoff),
          ),
        ),
      ),
    )
    .for("update");

  let recovered = 0;

  for (const candidate of candidates) {
    if (
      (candidate.batch.status === "PENDING" && candidate.run.status === "PENDING") ||
      (candidate.batch.status === "RUNNING" && candidate.run.status === "RUNNING")
    ) {
      const failedPair = await failPair(database, candidate, "INTERRUPTED", recoveredAt);

      if (failedPair.batch.status === "FAILED" && failedPair.run.status === "FAILED") {
        recovered += 1;
      }
    }
  }

  return recovered;
}

export async function startGenerationInvocation(
  database: typeof db,
  workspaceId: string,
  batchId: string,
  runId: string,
  clock: () => Date,
): Promise<GenerationInvocationResult> {
  return database.transaction(async (transaction) => {
    await lockGenerationWorkspace(transaction, workspaceId);
    const pair = await lockPair(transaction, workspaceId, batchId, runId);

    if (!pair) {
      throw new ApplicationError("INTERNAL_ERROR", "The generation operation was not found.");
    }

    if (pair.batch.status !== "PENDING" || pair.run.status !== "PENDING") {
      return { started: false, pair };
    }

    const startedAt = clock();

    const [reservation] = await transaction
      .select()
      .from(workspaceGenerationQuotaReservations)
      .where(
        and(
          eq(workspaceGenerationQuotaReservations.workspaceId, workspaceId),
          eq(workspaceGenerationQuotaReservations.batchId, batchId),
        ),
      )
      .for("update");

    if (!reservation || reservation.invokedAt !== null || reservation.releasedAt !== null) {
      const failedPair = await failPair(transaction, pair, "INTERRUPTED", startedAt);
      return { started: false, pair: failedPair };
    }

    const [updatedRun] = await transaction
      .update(aiRuns)
      .set({ status: "RUNNING", startedAt })
      .where(and(eq(aiRuns.id, runId), eq(aiRuns.status, "PENDING")))
      .returning();
    const [updatedBatch] = await transaction
      .update(ideaGenerationBatches)
      .set({ status: "RUNNING", startedAt })
      .where(
        and(eq(ideaGenerationBatches.id, batchId), eq(ideaGenerationBatches.status, "PENDING")),
      )
      .returning();

    if (!updatedRun || !updatedBatch) {
      throw new ApplicationError("INTERNAL_ERROR", "The generation operation could not start.");
    }

    const [updatedReservation] = await transaction
      .update(workspaceGenerationQuotaReservations)
      .set({ invokedAt: startedAt })
      .where(
        and(
          eq(workspaceGenerationQuotaReservations.id, reservation.id),
          isNull(workspaceGenerationQuotaReservations.invokedAt),
          isNull(workspaceGenerationQuotaReservations.releasedAt),
        ),
      )
      .returning();

    if (!updatedReservation) {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The generation quota reservation could not start.",
      );
    }

    return {
      started: true,
      pair: { batch: updatedBatch, run: updatedRun },
    };
  });
}

export async function completeGenerationInvocation(
  database: typeof db,
  workspaceId: string,
  batchId: string,
  runId: string,
  result: SuccessfulGenerationResult,
  clock: () => Date,
): Promise<GenerationCompletionResult> {
  return database.transaction(async (transaction) => {
    const pair = await lockPair(transaction, workspaceId, batchId, runId);

    if (!pair) {
      throw new ApplicationError("INTERNAL_ERROR", "The generation operation was not found.");
    }

    if (pair.batch.status !== "RUNNING" || pair.run.status !== "RUNNING") {
      return { completed: false, pair };
    }

    const completedAt = clock();
    await transaction.insert(ideas).values(
      result.output.ideas.map((idea, index) => ({
        id: randomUUID(),
        batchId,
        position: index + 1,
        title: idea.title,
        description: idea.description,
        ...(idea.category ? { category: idea.category } : {}),
        language: pair.batch.requestedLanguage,
        status: "NEW",
        statusChangedAt: completedAt,
        createdAt: completedAt,
        updatedAt: completedAt,
      })),
    );

    const [updatedRun] = await transaction
      .update(aiRuns)
      .set({
        status: "COMPLETED",
        outputSnapshot: result.output,
        usage: result.usage ?? null,
        completedAt,
      })
      .where(and(eq(aiRuns.id, runId), eq(aiRuns.status, "RUNNING")))
      .returning();
    const [updatedBatch] = await transaction
      .update(ideaGenerationBatches)
      .set({ status: "COMPLETED", completedAt })
      .where(
        and(eq(ideaGenerationBatches.id, batchId), eq(ideaGenerationBatches.status, "RUNNING")),
      )
      .returning();

    if (!updatedRun || !updatedBatch) {
      throw new ApplicationError("INTERNAL_ERROR", "The generation completion was not applied.");
    }

    return { completed: true, pair: { batch: updatedBatch, run: updatedRun } };
  });
}

export async function failGenerationInvocation(
  database: typeof db,
  workspaceId: string,
  batchId: string,
  runId: string,
  category: FailureCategory,
  clock: () => Date,
): Promise<GenerationPair> {
  return database.transaction(async (transaction) => {
    const pair = await lockPair(transaction, workspaceId, batchId, runId);

    if (!pair) {
      throw new ApplicationError("INTERNAL_ERROR", "The generation operation was not found.");
    }

    return failPair(transaction, pair, category, clock());
  });
}
