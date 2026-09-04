import "server-only";

import { randomUUID } from "node:crypto";

import { and, count, eq, gte, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  aiRuns,
  contentDna,
  contentDnaVersions,
  contentDrafts,
  contentGenerationAttempts,
  contentVersions,
  contents,
  ideaGenerationBatches,
  ideas,
  workspaceContentGenerationQuotaReservations,
} from "@/db/schema";
import { ApplicationError } from "@/lib/errors/app-error";
import {
  failureCategorySchema,
  generationLifecycleSchema,
  type FailureCategory,
  type GenerationSettings,
} from "@/modules/ai/domain/ai-contracts";
import { decisionStateSchema } from "@/modules/ideas/domain/idea-generation-contracts";
import {
  parseContentDnaPayload,
  getContentDnaReadiness,
  type ContentDnaPayload,
} from "@/modules/dna/domain/content-dna-payload";
import { requireWorkspaceOwner } from "@/modules/workspace/application";
import { lockWorkspaceForUpdate } from "@/modules/workspace/application";
import type { GenerateContentScriptSuccess } from "@/modules/ai/domain/generate-content-script";
import type { CanonicalContentScriptGenerationRequest } from "../domain/content-script-contracts";
import { parseCanonicalIdea, type CanonicalIdea } from "@/modules/ideas/domain";
import {
  clearIdeaProductionQueuePositionInTransaction,
  normalizeProductionQueuePositionsInTransaction,
} from "./production-queue-repository";

const CONTENT_SCRIPT_GENERATION_KIND = "CONTENT_SCRIPT_GENERATION" as const;
const CONTENT_SCRIPT_GENERATION_PROVIDER = "avalai" as const;
const CONTENT_SCRIPT_GENERATION_MODEL = "gpt-5.6-luna" as const;
const CONTENT_SCRIPT_GENERATION_PROMPT_VERSION = "content-script-generation/v1" as const;
const TEN_MINUTES_MS = 10 * 60 * 1_000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1_000;
const PENDING_STALE_MS = 105 * 1_000;
const RUNNING_STALE_MS = 105 * 1_000;
const TEN_MINUTE_QUOTA = 2;
const TWENTY_FOUR_HOUR_QUOTA = 8;

export const contentScriptGenerationSettings: GenerationSettings = {
  structuredOutput: { schemaName: "content_script_v1", schemaVersion: 1 },
  reasoningEffort: "medium",
  maxOutputTokens: 16_000,
  timeoutSeconds: 90,
  retryPolicy: { maxRetries: 0 },
  serviceTier: "default",
};

export type ContentGenerationWriter = Pick<typeof db, "select" | "insert" | "update" | "execute">;

export type ContentGenerationPair = Readonly<{
  attempt: typeof contentGenerationAttempts.$inferSelect;
  run: typeof aiRuns.$inferSelect;
}>;

export type ContentGenerationInvocationResult = Readonly<{
  started: boolean;
  pair: ContentGenerationPair;
}>;

export type ContentGenerationCompletionResult = Readonly<{
  completed: boolean;
  pair: ContentGenerationPair;
  contentId: string | null;
}>;

export type ContentGenerationPreflightResult =
  | Readonly<{ kind: "replay"; pair: ContentGenerationPair }>
  | Readonly<{
      kind: "created";
      pair: ContentGenerationPair;
      sourceIdea: CanonicalIdea;
      contentDna: ContentDnaPayload;
    }>
  | Readonly<{ kind: "rate-limited" }>;

function validationError(message: string): ApplicationError {
  return new ApplicationError("VALIDATION_ERROR", message);
}

function notFoundError(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "The requested Idea was not found.");
}

function conflictError(): ApplicationError {
  return new ApplicationError(
    "CONFLICT",
    "The requested Content DNA version is no longer current.",
  );
}

export function parseStoredContentGenerationStatus(value: string) {
  const result = generationLifecycleSchema.safeParse(value);

  if (!result.success) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The Content generation lifecycle state is invalid.",
    );
  }

  return result.data;
}

export function parseStoredContentGenerationErrorCategory(
  value: string | null,
): FailureCategory | null {
  if (value === null) {
    return null;
  }

  const result = failureCategorySchema.safeParse(value);

  if (!result.success) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The Content generation failure state is invalid.",
    );
  }

  return result.data;
}

export async function lockContentGenerationWorkspace(
  database: ContentGenerationWriter,
  workspaceId: string,
): Promise<void> {
  await lockWorkspaceForUpdate(database, workspaceId);
}

export async function findContentGenerationPairByIdempotencyKey(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  idempotencyKey: string,
): Promise<ContentGenerationPair | undefined> {
  const [pair] = await database
    .select({ attempt: contentGenerationAttempts, run: aiRuns })
    .from(contentGenerationAttempts)
    .innerJoin(
      aiRuns,
      and(
        eq(contentGenerationAttempts.aiRunId, aiRuns.id),
        eq(contentGenerationAttempts.workspaceId, aiRuns.workspaceId),
      ),
    )
    .where(
      and(
        eq(contentGenerationAttempts.workspaceId, workspaceId),
        eq(contentGenerationAttempts.idempotencyKey, idempotencyKey),
      ),
    );

  return pair;
}

export async function findContentByGenerationAttemptId(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  attemptId: string,
): Promise<typeof contents.$inferSelect | undefined> {
  const [content] = await database
    .select()
    .from(contents)
    .where(
      and(eq(contents.workspaceId, workspaceId), eq(contents.sourceGenerationAttemptId, attemptId)),
    );

  return content;
}

async function lockContentGenerationPair(
  database: ContentGenerationWriter,
  workspaceId: string,
  attemptId: string,
  runId: string,
): Promise<ContentGenerationPair | undefined> {
  const [attempt] = await database
    .select()
    .from(contentGenerationAttempts)
    .where(
      and(
        eq(contentGenerationAttempts.workspaceId, workspaceId),
        eq(contentGenerationAttempts.id, attemptId),
        eq(contentGenerationAttempts.aiRunId, runId),
      ),
    )
    .for("update");

  if (!attempt) {
    return undefined;
  }

  const [run] = await database
    .select()
    .from(aiRuns)
    .where(
      and(
        eq(aiRuns.workspaceId, workspaceId),
        eq(aiRuns.id, runId),
        eq(aiRuns.kind, CONTENT_SCRIPT_GENERATION_KIND),
      ),
    )
    .for("update");

  return run ? { attempt, run } : undefined;
}

export async function loadAcceptedContentGenerationInputs(
  database: Pick<typeof db, "select">,
  pair: ContentGenerationPair,
): Promise<Readonly<{ sourceIdea: CanonicalIdea; contentDna: ContentDnaPayload }>> {
  const [ideaRecord] = await database
    .select({ idea: ideas })
    .from(ideas)
    .innerJoin(ideaGenerationBatches, eq(ideas.batchId, ideaGenerationBatches.id))
    .where(
      and(
        eq(ideas.id, pair.attempt.sourceIdeaId),
        eq(ideaGenerationBatches.workspaceId, pair.attempt.workspaceId),
      ),
    );

  if (!ideaRecord) {
    throw new ApplicationError("INTERNAL_ERROR", "The accepted source Idea could not be loaded.");
  }

  const [dnaRecord] = await database
    .select({ version: contentDnaVersions })
    .from(contentDnaVersions)
    .innerJoin(contentDna, eq(contentDnaVersions.contentDnaId, contentDna.id))
    .where(
      and(
        eq(contentDnaVersions.id, pair.attempt.contentDnaVersionId),
        eq(contentDna.workspaceId, pair.attempt.workspaceId),
      ),
    );

  if (!dnaRecord) {
    throw new ApplicationError("INTERNAL_ERROR", "The accepted Content DNA could not be loaded.");
  }

  try {
    return {
      sourceIdea: parseCanonicalIdea({
        title: ideaRecord.idea.title,
        description: ideaRecord.idea.description,
        ...(ideaRecord.idea.category === null ? {} : { category: ideaRecord.idea.category }),
      }),
      contentDna: parseContentDnaPayload(dnaRecord.version.payload),
    };
  } catch {
    throw new ApplicationError("INTERNAL_ERROR", "The accepted generation inputs are invalid.");
  }
}

type IdeaWithOwningBatch = Readonly<{
  idea: typeof ideas.$inferSelect;
  batch: typeof ideaGenerationBatches.$inferSelect;
}>;

async function findIdeaWithOwningBatchForUpdate(
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

async function resolveAcceptedSourceIdea(
  database: Pick<typeof db, "select">,
  input: CanonicalContentScriptGenerationRequest,
): Promise<CanonicalIdea> {
  const source = await findIdeaWithOwningBatchForUpdate(
    database,
    input.workspaceId,
    input.sourceIdeaId,
  );

  if (!source) {
    throw notFoundError();
  }

  const status = decisionStateSchema.safeParse(source.idea.status);

  if (!status.success) {
    throw new ApplicationError("INTERNAL_ERROR", "The Idea decision state is invalid.");
  }

  if (status.data !== "ACCEPTED") {
    throw validationError("Only an accepted Idea can generate Content.");
  }

  try {
    return parseCanonicalIdea({
      title: source.idea.title,
      description: source.idea.description,
      ...(source.idea.category === null ? {} : { category: source.idea.category }),
    });
  } catch {
    throw new ApplicationError("INTERNAL_ERROR", "The source Idea data is invalid.");
  }
}

export type CurrentContentDna = Readonly<{
  id: string;
  payload: ContentDnaPayload;
}>;

async function resolveCurrentContentDna(
  database: Pick<typeof db, "select">,
  input: CanonicalContentScriptGenerationRequest,
): Promise<CurrentContentDna> {
  const [result] = await database
    .select({ container: contentDna, version: contentDnaVersions })
    .from(contentDna)
    .innerJoin(
      contentDnaVersions,
      and(
        eq(contentDna.id, contentDnaVersions.contentDnaId),
        eq(contentDna.currentVersionId, contentDnaVersions.id),
      ),
    )
    .where(eq(contentDna.workspaceId, input.workspaceId));

  if (!result) {
    throw validationError("Complete Content DNA is required before generating Content.");
  }

  let payload: ContentDnaPayload;

  try {
    payload = parseContentDnaPayload(result.version.payload);
  } catch {
    throw validationError("The current Content DNA is invalid.");
  }

  if (getContentDnaReadiness(payload) !== "AI_READY") {
    throw validationError("Complete Content DNA is required before generating Content.");
  }

  if (result.version.id !== input.baseContentDnaVersionId) {
    throw conflictError();
  }

  if (!payload.language?.contentLanguages?.includes(input.requestedLanguage)) {
    throw validationError("The requested content language is not configured in Content DNA.");
  }

  return { id: result.version.id, payload };
}

async function countReservationsInWindow(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  cutoff: Date,
): Promise<{ invoked: number; live: number }> {
  const [invoked] = await database
    .select({ value: count() })
    .from(workspaceContentGenerationQuotaReservations)
    .where(
      and(
        eq(workspaceContentGenerationQuotaReservations.workspaceId, workspaceId),
        gte(workspaceContentGenerationQuotaReservations.invokedAt, cutoff),
      ),
    );
  const [live] = await database
    .select({ value: count() })
    .from(workspaceContentGenerationQuotaReservations)
    .where(
      and(
        eq(workspaceContentGenerationQuotaReservations.workspaceId, workspaceId),
        isNull(workspaceContentGenerationQuotaReservations.invokedAt),
        isNull(workspaceContentGenerationQuotaReservations.releasedAt),
        gte(workspaceContentGenerationQuotaReservations.reservedAt, cutoff),
      ),
    );

  return { invoked: Number(invoked?.value ?? 0), live: Number(live?.value ?? 0) };
}

export async function reserveContentGenerationOperation(
  database: ContentGenerationWriter,
  userId: string,
  input: CanonicalContentScriptGenerationRequest,
  fingerprint: string,
  clock: () => Date,
): Promise<ContentGenerationPreflightResult> {
  await lockContentGenerationWorkspace(database, input.workspaceId);
  await requireWorkspaceOwner(userId, input.workspaceId, database);

  const existing = await findContentGenerationPairByIdempotencyKey(
    database,
    input.workspaceId,
    input.idempotencyKey,
  );

  if (existing) {
    if (existing.attempt.requestFingerprint !== fingerprint) {
      throw new ApplicationError(
        "CONFLICT",
        "The idempotency key was already used for a different generation request.",
      );
    }

    return { kind: "replay", pair: existing };
  }

  const sourceIdea = await resolveAcceptedSourceIdea(database, input);
  const currentContentDna = await resolveCurrentContentDna(database, input);
  const acceptedAt = clock();

  await recoverStalePendingContentGenerationAttemptsInTransaction(
    database,
    input.workspaceId,
    acceptedAt,
  );

  const tenMinute = await countReservationsInWindow(
    database,
    input.workspaceId,
    new Date(acceptedAt.getTime() - TEN_MINUTES_MS),
  );
  const day = await countReservationsInWindow(
    database,
    input.workspaceId,
    new Date(acceptedAt.getTime() - TWENTY_FOUR_HOURS_MS),
  );

  if (
    tenMinute.invoked + tenMinute.live >= TEN_MINUTE_QUOTA ||
    day.invoked + day.live >= TWENTY_FOUR_HOUR_QUOTA
  ) {
    return { kind: "rate-limited" };
  }

  const attemptId = randomUUID();
  const runId = randomUUID();
  const [run] = await database
    .insert(aiRuns)
    .values({
      id: runId,
      workspaceId: input.workspaceId,
      kind: CONTENT_SCRIPT_GENERATION_KIND,
      provider: CONTENT_SCRIPT_GENERATION_PROVIDER,
      model: CONTENT_SCRIPT_GENERATION_MODEL,
      promptVersion: CONTENT_SCRIPT_GENERATION_PROMPT_VERSION,
      generationSettings: contentScriptGenerationSettings,
      status: "PENDING",
      createdAt: acceptedAt,
    })
    .returning();

  const [attempt] = await database
    .insert(contentGenerationAttempts)
    .values({
      id: attemptId,
      workspaceId: input.workspaceId,
      sourceIdeaId: input.sourceIdeaId,
      contentDnaVersionId: currentContentDna.id,
      requestedLanguage: input.requestedLanguage,
      format: input.format,
      instructions: input.instructions ?? null,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: fingerprint,
      aiRunId: runId,
      status: "PENDING",
      createdAt: acceptedAt,
    })
    .returning();

  if (!run || !attempt) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The Content generation operation was not created.",
    );
  }

  await database.insert(workspaceContentGenerationQuotaReservations).values({
    workspaceId: input.workspaceId,
    attemptId,
    reservedAt: acceptedAt,
  });

  return {
    kind: "created",
    pair: { attempt, run },
    sourceIdea,
    contentDna: currentContentDna.payload,
  };
}

export async function startContentGenerationInvocation(
  database: typeof db,
  workspaceId: string,
  attemptId: string,
  runId: string,
  clock: () => Date,
): Promise<ContentGenerationInvocationResult> {
  return database.transaction(async (transaction) => {
    await lockContentGenerationWorkspace(transaction, workspaceId);
    const pair = await lockContentGenerationPair(transaction, workspaceId, attemptId, runId);

    if (!pair) {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The Content generation operation was not found.",
      );
    }

    if (pair.attempt.status !== "PENDING" || pair.run.status !== "PENDING") {
      return { started: false, pair };
    }

    const [reservation] = await transaction
      .select()
      .from(workspaceContentGenerationQuotaReservations)
      .where(
        and(
          eq(workspaceContentGenerationQuotaReservations.workspaceId, workspaceId),
          eq(workspaceContentGenerationQuotaReservations.attemptId, attemptId),
        ),
      )
      .for("update");

    if (!reservation || reservation.invokedAt !== null || reservation.releasedAt !== null) {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The Content generation quota reservation is inconsistent.",
      );
    }

    const startedAt = clock();
    const [updatedRun] = await transaction
      .update(aiRuns)
      .set({ status: "RUNNING", startedAt })
      .where(and(eq(aiRuns.id, runId), eq(aiRuns.status, "PENDING")))
      .returning();
    const [updatedAttempt] = await transaction
      .update(contentGenerationAttempts)
      .set({ status: "RUNNING", startedAt })
      .where(
        and(
          eq(contentGenerationAttempts.id, attemptId),
          eq(contentGenerationAttempts.status, "PENDING"),
        ),
      )
      .returning();

    if (!updatedRun || !updatedAttempt) {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The Content generation operation could not start.",
      );
    }

    const [updatedReservation] = await transaction
      .update(workspaceContentGenerationQuotaReservations)
      .set({ invokedAt: startedAt })
      .where(
        and(
          eq(workspaceContentGenerationQuotaReservations.id, reservation.id),
          isNull(workspaceContentGenerationQuotaReservations.invokedAt),
          isNull(workspaceContentGenerationQuotaReservations.releasedAt),
        ),
      )
      .returning();

    if (!updatedReservation) {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The Content generation quota reservation could not start.",
      );
    }

    return { started: true, pair: { attempt: updatedAttempt, run: updatedRun } };
  });
}

export async function completeContentGenerationInvocation(
  database: typeof db,
  workspaceId: string,
  attemptId: string,
  runId: string,
  userId: string,
  result: GenerateContentScriptSuccess,
  clock: () => Date,
): Promise<ContentGenerationCompletionResult> {
  return database.transaction(async (transaction) => {
    await lockContentGenerationWorkspace(transaction, workspaceId);
    const pair = await lockContentGenerationPair(transaction, workspaceId, attemptId, runId);

    if (!pair) {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The Content generation operation was not found.",
      );
    }

    if (pair.attempt.status !== "RUNNING" || pair.run.status !== "RUNNING") {
      const content = await findContentByGenerationAttemptId(transaction, workspaceId, attemptId);
      return { completed: false, pair, contentId: content?.id ?? null };
    }

    const completedAt = clock();
    const contentId = randomUUID();

    const [content] = await transaction
      .insert(contents)
      .values({
        id: contentId,
        workspaceId: pair.attempt.workspaceId,
        sourceIdeaId: pair.attempt.sourceIdeaId,
        contentLanguage: pair.attempt.requestedLanguage,
        format: pair.attempt.format,
        sourceGenerationAttemptId: pair.attempt.id,
        createdAt: completedAt,
      })
      .returning();

    if (!content) {
      throw new ApplicationError("INTERNAL_ERROR", "The generated Content could not be created.");
    }

    const [draft] = await transaction
      .insert(contentDrafts)
      .values({
        contentId,
        document: result.output,
        revision: 1,
        createdAt: completedAt,
        updatedAt: completedAt,
      })
      .returning();

    if (!draft) {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The generated Content Draft could not be created.",
      );
    }

    const [version] = await transaction
      .insert(contentVersions)
      .values({
        contentId,
        versionNumber: 1,
        document: result.output,
        source: "AI_GENERATED",
        aiRunId: pair.run.id,
        createdByUserId: userId,
        createdAt: completedAt,
      })
      .returning();

    if (!version) {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The initial Content Version could not be created.",
      );
    }

    const [updatedRun] = await transaction
      .update(aiRuns)
      .set({
        status: "COMPLETED",
        outputSnapshot: result.output,
        usage: result.usage ?? null,
        providerRequestCorrelation: result.providerRequestCorrelation ?? null,
        completedAt,
      })
      .where(and(eq(aiRuns.id, runId), eq(aiRuns.status, "RUNNING")))
      .returning();
    const [updatedAttempt] = await transaction
      .update(contentGenerationAttempts)
      .set({ status: "COMPLETED", completedAt })
      .where(
        and(
          eq(contentGenerationAttempts.id, attemptId),
          eq(contentGenerationAttempts.status, "RUNNING"),
        ),
      )
      .returning();

    if (!updatedRun || !updatedAttempt) {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The Content generation completion was not applied.",
      );
    }

    // The source Idea leaves the derived initial queue in the same atomic
    // transaction as Content, Draft, Version #1, and lifecycle completion.
    await clearIdeaProductionQueuePositionInTransaction(
      transaction,
      workspaceId,
      pair.attempt.sourceIdeaId,
    );
    await normalizeProductionQueuePositionsInTransaction(transaction, workspaceId);

    return { completed: true, pair: { attempt: updatedAttempt, run: updatedRun }, contentId };
  });
}

export async function failContentGenerationInvocation(
  database: typeof db,
  workspaceId: string,
  attemptId: string,
  runId: string,
  category: FailureCategory,
  clock: () => Date,
): Promise<ContentGenerationPair> {
  return database.transaction(async (transaction) => {
    const pair = await lockContentGenerationPair(transaction, workspaceId, attemptId, runId);

    if (!pair) {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The Content generation operation was not found.",
      );
    }

    return failContentGenerationPairInTransaction(transaction, pair, category, clock());
  });
}

async function lockPendingCandidates(
  database: ContentGenerationWriter,
  workspaceId: string,
  cutoff: Date,
): Promise<ContentGenerationPair[]> {
  return database
    .select({ attempt: contentGenerationAttempts, run: aiRuns })
    .from(contentGenerationAttempts)
    .innerJoin(
      aiRuns,
      and(
        eq(contentGenerationAttempts.aiRunId, aiRuns.id),
        eq(contentGenerationAttempts.workspaceId, aiRuns.workspaceId),
      ),
    )
    .where(
      and(
        eq(contentGenerationAttempts.workspaceId, workspaceId),
        eq(contentGenerationAttempts.status, "PENDING"),
        eq(aiRuns.status, "PENDING"),
        lte(contentGenerationAttempts.createdAt, cutoff),
      ),
    )
    .for("update");
}

/**
 * Shared active-pair failure primitive. Ticket 05 invokes it for stale
 * PENDING pairs; Ticket 06 can reuse it for provider failures and RUNNING
 * recovery without creating a second lifecycle transition implementation.
 */
export async function failContentGenerationPairInTransaction(
  database: ContentGenerationWriter,
  pair: ContentGenerationPair,
  category: FailureCategory,
  failedAt: Date,
): Promise<ContentGenerationPair> {
  const attemptStatus = parseStoredContentGenerationStatus(pair.attempt.status);
  const runStatus = parseStoredContentGenerationStatus(pair.run.status);

  if (attemptStatus !== runStatus) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The Content generation lifecycle pair is inconsistent.",
    );
  }

  if (attemptStatus !== "PENDING" && attemptStatus !== "RUNNING") {
    return pair;
  }

  const [reservation] = await database
    .select()
    .from(workspaceContentGenerationQuotaReservations)
    .where(
      and(
        eq(workspaceContentGenerationQuotaReservations.workspaceId, pair.attempt.workspaceId),
        eq(workspaceContentGenerationQuotaReservations.attemptId, pair.attempt.id),
      ),
    )
    .for("update");

  if (!reservation) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The Content generation quota reservation is missing.",
    );
  }

  if (
    (attemptStatus === "PENDING" &&
      (reservation.invokedAt !== null || reservation.releasedAt !== null)) ||
    (attemptStatus === "RUNNING" &&
      (reservation.invokedAt === null || reservation.releasedAt !== null))
  ) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The Content generation quota reservation state is inconsistent.",
    );
  }

  const [updatedRun] = await database
    .update(aiRuns)
    .set({ status: "FAILED", errorCategory: category, failedAt })
    .where(and(eq(aiRuns.id, pair.run.id), eq(aiRuns.status, attemptStatus)))
    .returning();
  const [updatedAttempt] = await database
    .update(contentGenerationAttempts)
    .set({ status: "FAILED", errorCategory: category, failedAt })
    .where(
      and(
        eq(contentGenerationAttempts.id, pair.attempt.id),
        eq(contentGenerationAttempts.status, attemptStatus),
      ),
    )
    .returning();

  if (!updatedRun || !updatedAttempt) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The Content generation failure update was not applied.",
    );
  }

  if (attemptStatus === "PENDING") {
    const [releasedReservation] = await database
      .update(workspaceContentGenerationQuotaReservations)
      .set({ releasedAt: failedAt })
      .where(
        and(
          eq(workspaceContentGenerationQuotaReservations.id, reservation.id),
          isNull(workspaceContentGenerationQuotaReservations.invokedAt),
          isNull(workspaceContentGenerationQuotaReservations.releasedAt),
        ),
      )
      .returning();

    if (!releasedReservation) {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The Content generation reservation was not released.",
      );
    }
  }

  return { attempt: updatedAttempt, run: updatedRun };
}

export async function recoverStalePendingContentGenerationAttemptsInTransaction(
  database: ContentGenerationWriter,
  workspaceId: string,
  recoveredAt: Date,
): Promise<number> {
  const cutoff = new Date(recoveredAt.getTime() - PENDING_STALE_MS);
  const candidates = await lockPendingCandidates(database, workspaceId, cutoff);
  let recovered = 0;

  for (const candidate of candidates) {
    await failContentGenerationPairInTransaction(database, candidate, "INTERRUPTED", recoveredAt);
    recovered += 1;
  }

  return recovered;
}

export async function recoverStaleRunningContentGenerationAttemptsInTransaction(
  database: ContentGenerationWriter,
  workspaceId: string,
  recoveredAt: Date,
): Promise<number> {
  const cutoff = new Date(recoveredAt.getTime() - RUNNING_STALE_MS);
  const candidates = await database
    .select({ attemptId: contentGenerationAttempts.id, runId: aiRuns.id })
    .from(contentGenerationAttempts)
    .innerJoin(
      aiRuns,
      and(
        eq(contentGenerationAttempts.aiRunId, aiRuns.id),
        eq(contentGenerationAttempts.workspaceId, aiRuns.workspaceId),
      ),
    )
    .where(
      and(
        eq(contentGenerationAttempts.workspaceId, workspaceId),
        eq(contentGenerationAttempts.status, "RUNNING"),
        eq(aiRuns.status, "RUNNING"),
        lte(contentGenerationAttempts.startedAt, cutoff),
      ),
    );

  let recovered = 0;

  for (const candidate of candidates) {
    const pair = await lockContentGenerationPair(
      database,
      workspaceId,
      candidate.attemptId,
      candidate.runId,
    );

    if (
      !pair ||
      pair.attempt.status !== "RUNNING" ||
      pair.run.status !== "RUNNING" ||
      pair.attempt.startedAt === null ||
      pair.attempt.startedAt > cutoff
    ) {
      continue;
    }

    const failedPair = await failContentGenerationPairInTransaction(
      database,
      pair,
      "INTERRUPTED",
      recoveredAt,
    );

    if (failedPair.attempt.status === "FAILED" && failedPair.run.status === "FAILED") {
      recovered += 1;
    }
  }

  return recovered;
}
