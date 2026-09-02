import "server-only";

import { randomUUID } from "node:crypto";

import { and, count, eq, gte, isNull } from "drizzle-orm";

import { db } from "@/db";
import { aiRuns, ideaGenerationBatches, workspaceGenerationQuotaReservations } from "@/db/schema";
import { ApplicationError } from "@/lib/errors/app-error";
import type { GenerationSettings } from "@/modules/ai/domain/ai-contracts";
import { findCurrentContentDna } from "./generation-dna-repository";
import {
  recoverStaleAttemptsInTransaction,
  lockGenerationWorkspace,
} from "./generation-attempt-repository";
import { requireWorkspaceOwner } from "@/modules/workspace/application";
import { IDEA_GENERATION_COUNT } from "./generation-types";
import type {
  GenerationOperationInput,
  GenerationPair,
  GenerationPreflightResult,
  GenerationWriter,
} from "./generation-types";

const IDEA_GENERATION_KIND = "IDEA_GENERATION" as const;
const IDEA_GENERATION_PROVIDER = "openai" as const;
const IDEA_GENERATION_MODEL = "gpt-5.6-terra" as const;
const IDEA_GENERATION_PROMPT_VERSION = "idea-generation/v1" as const;
const TEN_MINUTES_MS = 10 * 60 * 1_000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1_000;
const TEN_MINUTE_QUOTA = 3;
const TWENTY_FOUR_HOUR_QUOTA = 12;

export const ideaGenerationSettings: GenerationSettings = {
  structuredOutput: { schemaName: "idea_generation_v1", schemaVersion: 1 },
  reasoningEffort: "medium",
  maxOutputTokens: 16_000,
  timeoutSeconds: 60,
  retryPolicy: { maxRetries: 0 },
  serviceTier: "default",
};

export async function findPairByIdempotencyKey(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  idempotencyKey: string,
): Promise<GenerationPair | undefined> {
  const [pair] = await database
    .select({ batch: ideaGenerationBatches, run: aiRuns })
    .from(ideaGenerationBatches)
    .innerJoin(aiRuns, eq(ideaGenerationBatches.aiRunId, aiRuns.id))
    .where(
      and(
        eq(ideaGenerationBatches.workspaceId, workspaceId),
        eq(ideaGenerationBatches.idempotencyKey, idempotencyKey),
      ),
    );

  return pair;
}

async function countReservationsInWindow(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  cutoff: Date,
): Promise<{ invoked: number; live: number }> {
  const [invoked] = await database
    .select({ value: count() })
    .from(workspaceGenerationQuotaReservations)
    .where(
      and(
        eq(workspaceGenerationQuotaReservations.workspaceId, workspaceId),
        gte(workspaceGenerationQuotaReservations.invokedAt, cutoff),
      ),
    );
  const [live] = await database
    .select({ value: count() })
    .from(workspaceGenerationQuotaReservations)
    .where(
      and(
        eq(workspaceGenerationQuotaReservations.workspaceId, workspaceId),
        isNull(workspaceGenerationQuotaReservations.invokedAt),
        isNull(workspaceGenerationQuotaReservations.releasedAt),
        gte(workspaceGenerationQuotaReservations.reservedAt, cutoff),
      ),
    );

  return { invoked: Number(invoked?.value ?? 0), live: Number(live?.value ?? 0) };
}

export async function reserveGenerationOperation(
  database: GenerationWriter,
  userId: string,
  input: GenerationOperationInput,
  fingerprint: string,
  clock: () => Date,
): Promise<GenerationPreflightResult> {
  await lockGenerationWorkspace(database, input.workspaceId);
  const reservedAt = clock();
  await requireWorkspaceOwner(userId, input.workspaceId, database);

  const existing = await findPairByIdempotencyKey(
    database,
    input.workspaceId,
    input.idempotencyKey,
  );

  if (existing) {
    if (existing.batch.requestFingerprint !== fingerprint) {
      throw new ApplicationError(
        "CONFLICT",
        "The idempotency key was already used for a different generation request.",
      );
    }

    return { kind: "replay", pair: existing };
  }

  await recoverStaleAttemptsInTransaction(database, input.workspaceId, reservedAt);
  const recoveredExisting = await findPairByIdempotencyKey(
    database,
    input.workspaceId,
    input.idempotencyKey,
  );

  if (recoveredExisting) {
    if (recoveredExisting.batch.requestFingerprint !== fingerprint) {
      throw new ApplicationError(
        "CONFLICT",
        "The idempotency key was already used for a different generation request.",
      );
    }

    return { kind: "replay", pair: recoveredExisting };
  }

  const currentContentDna = await findCurrentContentDna(
    database,
    input.workspaceId,
    input.baseContentDnaVersionId,
    input.requestedLanguage,
  );
  const tenMinute = await countReservationsInWindow(
    database,
    input.workspaceId,
    new Date(reservedAt.getTime() - TEN_MINUTES_MS),
  );
  const day = await countReservationsInWindow(
    database,
    input.workspaceId,
    new Date(reservedAt.getTime() - TWENTY_FOUR_HOURS_MS),
  );

  if (
    tenMinute.invoked + tenMinute.live >= TEN_MINUTE_QUOTA ||
    day.invoked + day.live >= TWENTY_FOUR_HOUR_QUOTA
  ) {
    return { kind: "rate-limited" };
  }

  const batchId = randomUUID();
  const runId = randomUUID();
  const [run] = await database
    .insert(aiRuns)
    .values({
      id: runId,
      workspaceId: input.workspaceId,
      kind: IDEA_GENERATION_KIND,
      provider: IDEA_GENERATION_PROVIDER,
      model: IDEA_GENERATION_MODEL,
      promptVersion: IDEA_GENERATION_PROMPT_VERSION,
      generationSettings: ideaGenerationSettings,
      status: "PENDING",
      createdAt: reservedAt,
    })
    .returning();
  const [batch] = await database
    .insert(ideaGenerationBatches)
    .values({
      id: batchId,
      workspaceId: input.workspaceId,
      contentDnaVersionId: input.baseContentDnaVersionId,
      aiRunId: runId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: fingerprint,
      requestedLanguage: input.requestedLanguage,
      requestedCount: IDEA_GENERATION_COUNT,
      status: "PENDING",
      createdAt: reservedAt,
    })
    .returning();

  if (!run || !batch) {
    throw new ApplicationError("INTERNAL_ERROR", "The generation operation was not created.");
  }

  await database.insert(workspaceGenerationQuotaReservations).values({
    workspaceId: input.workspaceId,
    batchId,
    reservedAt,
  });

  return { kind: "created", pair: { batch, run }, contentDna: currentContentDna };
}
