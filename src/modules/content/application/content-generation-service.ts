import "server-only";

import { z } from "zod";

import { db } from "@/db";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError, type RateLimitSource } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import {
  createGenerateContentScriptFailure,
  parseGenerateContentScriptResult,
  type GenerateContentScriptProvider,
  type GenerateContentScriptResult,
} from "@/modules/ai/domain/generate-content-script";
import {
  fingerprintContentScriptGenerationRequest,
  parseCanonicalContentScriptGenerationRequest,
  contentScriptFormatSchema,
  generationLanguageSchema,
  type ContentScriptFormat,
  type GenerationLanguage,
} from "../domain/content-script-contracts";
import type { FailureCategory, GenerationLifecycle } from "@/modules/ai/domain/ai-contracts";
import { requireWorkspaceOwner } from "@/modules/workspace/application";

import {
  failContentGenerationPairInTransaction,
  failContentGenerationInvocation,
  findContentByGenerationAttemptId,
  findContentGenerationPairByIdempotencyKey,
  loadAcceptedContentGenerationInputs,
  lockContentGenerationWorkspace,
  parseStoredContentGenerationErrorCategory,
  parseStoredContentGenerationStatus,
  recoverStalePendingContentGenerationAttemptsInTransaction,
  recoverStaleRunningContentGenerationAttemptsInTransaction,
  reserveContentGenerationOperation,
  startContentGenerationInvocation,
  completeContentGenerationInvocation,
  type ContentGenerationPair,
  type ContentGenerationPreflightResult,
} from "./content-generation-repository";

const recoveryInputSchema = z.object({ workspaceId: z.uuid() }).strict();

export type ContentGenerationAttemptDto = Readonly<{
  id: string;
  aiRunId: string;
  sourceIdeaId: string;
  contentDnaVersionId: string;
  requestedLanguage: GenerationLanguage;
  format: ContentScriptFormat;
  instructions: string | null;
  requestFingerprint: string;
  status: GenerationLifecycle;
  errorCategory: FailureCategory | null;
  rateLimitSource: RateLimitSource | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
}>;

export type ContentGenerationAcceptanceResult = Readonly<{
  attempt: ContentGenerationAttemptDto;
  replayed: boolean;
}>;

export type ContentGenerationResult = Readonly<{
  attempt: ContentGenerationAttemptDto;
  contentId: string | null;
  replayed: boolean;
}>;

export type ContentGenerationApplicationServiceDependencies = Readonly<{
  database?: typeof db;
  getAuthenticatedUserId?: () => Promise<string | null>;
  providerFactory?: (
    userId: string,
  ) => GenerateContentScriptProvider | Promise<GenerateContentScriptProvider>;
  clock?: () => Date;
  logger?: Pick<typeof logger, "info" | "warn" | "error">;
}>;

async function getServerAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession();

  return session?.user.id ?? null;
}

function parseRequest(input: unknown) {
  try {
    return parseCanonicalContentScriptGenerationRequest(input);
  } catch {
    throw new ApplicationError("VALIDATION_ERROR", "The Content generation request is invalid.");
  }
}

function parseRecoveryInput(input: unknown): { workspaceId: string } {
  const result = recoveryInputSchema.safeParse(input);

  if (!result.success) {
    throw new ApplicationError("VALIDATION_ERROR", "The recovery request is invalid.");
  }

  return result.data;
}

function toAttemptDto(pair: ContentGenerationPair): ContentGenerationAttemptDto {
  const requestedLanguage = generationLanguageSchema.safeParse(pair.attempt.requestedLanguage);
  const format = contentScriptFormatSchema.safeParse(pair.attempt.format);

  if (!requestedLanguage.success || !format.success) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The Content generation request state is invalid.",
    );
  }

  const status = parseStoredContentGenerationStatus(pair.attempt.status);
  const errorCategory = parseStoredContentGenerationErrorCategory(pair.attempt.errorCategory);

  return {
    id: pair.attempt.id,
    aiRunId: pair.attempt.aiRunId,
    sourceIdeaId: pair.attempt.sourceIdeaId,
    contentDnaVersionId: pair.attempt.contentDnaVersionId,
    requestedLanguage: requestedLanguage.data,
    format: format.data,
    instructions: pair.attempt.instructions,
    requestFingerprint: pair.attempt.requestFingerprint,
    status,
    errorCategory,
    rateLimitSource: status === "FAILED" && errorCategory === "RATE_LIMITED" ? "provider" : null,
    createdAt: pair.attempt.createdAt,
    startedAt: pair.attempt.startedAt,
    completedAt: pair.attempt.completedAt,
    failedAt: pair.attempt.failedAt,
  };
}

function mapFailureToApplicationError(
  category: FailureCategory,
  rateLimitSource: RateLimitSource = "provider",
): ApplicationError {
  if (category === "RATE_LIMITED") {
    return new ApplicationError("RATE_LIMITED", "Content generation is temporarily rate limited.", {
      rateLimitSource,
    });
  }

  if (category === "INVALID_OUTPUT") {
    return new ApplicationError(
      "AI_OUTPUT_INVALID",
      "The AI returned an invalid Content Script result.",
    );
  }

  return new ApplicationError("PROVIDER_ERROR", "Content generation could not be completed.");
}

function getFailureCategory(pair: ContentGenerationPair): FailureCategory {
  return parseStoredContentGenerationErrorCategory(pair.attempt.errorCategory) ?? "UNKNOWN";
}

function logOperation(
  serviceLogger: Pick<typeof logger, "info" | "warn" | "error">,
  level: "info" | "warn" | "error",
  event: string,
  context: Readonly<{
    userId: string;
    workspaceId: string;
    attemptId?: string;
    aiRunId?: string;
    errorCode?: ApplicationError["code"];
    errorCategory?: FailureCategory;
    transition?: string;
  }>,
): void {
  serviceLogger[level](event, {
    userId: context.userId,
    workspaceId: context.workspaceId,
    ...(context.attemptId ? { entityId: context.attemptId } : {}),
    ...(context.aiRunId ? { aiRunId: context.aiRunId } : {}),
    module: "content",
    operation: "generateContentScript",
    ...(context.errorCode ? { errorCode: context.errorCode } : {}),
    ...(context.errorCategory ? { errorCategory: context.errorCategory } : {}),
    ...(context.transition ? { transition: context.transition } : {}),
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

async function resolveUniqueRace(
  database: typeof db,
  workspaceId: string,
  idempotencyKey: string,
  fingerprint: string,
): Promise<ContentGenerationPreflightResult> {
  const existing = await findContentGenerationPairByIdempotencyKey(
    database,
    workspaceId,
    idempotencyKey,
  );

  if (!existing) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The Content generation operation could not be reserved.",
    );
  }

  if (existing.attempt.requestFingerprint !== fingerprint) {
    throw new ApplicationError(
      "CONFLICT",
      "The idempotency key was already used for a different generation request.",
    );
  }

  return { kind: "replay", pair: existing };
}

export function createContentGenerationApplicationService(
  dependencies: ContentGenerationApplicationServiceDependencies = {},
): Readonly<{
  acceptContentGeneration(input: unknown): Promise<ContentGenerationAcceptanceResult>;
  generateContentScript(input: unknown): Promise<ContentGenerationResult>;
  recoverStalePendingAttempts(input: unknown): Promise<Readonly<{ recovered: number }>>;
  recoverStaleRunningAttempts(input: unknown): Promise<Readonly<{ recovered: number }>>;
}> {
  const database = dependencies.database ?? db;
  const getAuthenticatedUserId =
    dependencies.getAuthenticatedUserId ?? getServerAuthenticatedUserId;
  const clock = dependencies.clock ?? (() => new Date());
  const serviceLogger = dependencies.logger ?? logger;

  async function acceptContentGeneration(
    input: unknown,
  ): Promise<ContentGenerationAcceptanceResult> {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
    }

    const parsedInput = parseRequest(input);
    await requireWorkspaceOwner(userId, parsedInput.workspaceId, database);
    const fingerprint = fingerprintContentScriptGenerationRequest(parsedInput);
    let preflight: ContentGenerationPreflightResult;

    try {
      preflight = await database.transaction(async (transaction) =>
        reserveContentGenerationOperation(transaction, userId, parsedInput, fingerprint, clock),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) {
        logOperation(serviceLogger, "warn", "content.generate.preflight_failed", {
          userId,
          workspaceId: parsedInput.workspaceId,
          errorCode: error instanceof ApplicationError ? error.code : "INTERNAL_ERROR",
        });
        throw error;
      }

      preflight = await resolveUniqueRace(
        database,
        parsedInput.workspaceId,
        parsedInput.idempotencyKey,
        fingerprint,
      );
    }

    if (preflight.kind === "rate-limited") {
      logOperation(serviceLogger, "warn", "content.generate.rate_limited", {
        userId,
        workspaceId: parsedInput.workspaceId,
        errorCode: "RATE_LIMITED",
      });
      throw new ApplicationError(
        "RATE_LIMITED",
        "Content generation is temporarily rate limited.",
        { rateLimitSource: "workspace" },
      );
    }

    const result = {
      attempt: toAttemptDto(preflight.pair),
      replayed: preflight.kind === "replay",
    };

    logOperation(
      serviceLogger,
      "info",
      result.replayed ? "content.generate.replayed" : "content.generate.accepted",
      {
        userId,
        workspaceId: parsedInput.workspaceId,
        attemptId: result.attempt.id,
        aiRunId: result.attempt.aiRunId,
      },
    );

    return result;
  }

  async function recoverStalePendingAttempts(
    input: unknown,
  ): Promise<Readonly<{ recovered: number }>> {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
    }

    const { workspaceId } = parseRecoveryInput(input);
    await requireWorkspaceOwner(userId, workspaceId, database);
    const recovered = await database.transaction(async (transaction) => {
      await lockContentGenerationWorkspace(transaction, workspaceId);
      await requireWorkspaceOwner(userId, workspaceId, transaction);
      return recoverStalePendingContentGenerationAttemptsInTransaction(
        transaction,
        workspaceId,
        clock(),
      );
    });

    if (recovered > 0) {
      logOperation(serviceLogger, "info", "content.generate.stale_pending_recovered", {
        userId,
        workspaceId,
      });
    }

    return { recovered };
  }

  async function recoverStaleRunningAttempts(
    input: unknown,
  ): Promise<Readonly<{ recovered: number }>> {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
    }

    const { workspaceId } = parseRecoveryInput(input);
    await requireWorkspaceOwner(userId, workspaceId, database);
    const recovered = await database.transaction(async (transaction) => {
      await lockContentGenerationWorkspace(transaction, workspaceId);
      await requireWorkspaceOwner(userId, workspaceId, transaction);
      return recoverStaleRunningContentGenerationAttemptsInTransaction(
        transaction,
        workspaceId,
        clock(),
      );
    });

    if (recovered > 0) {
      logOperation(serviceLogger, "info", "content.generate.stale_running_recovered", {
        userId,
        workspaceId,
        transition: "RUNNING->FAILED",
        errorCategory: "INTERRUPTED",
      });
    }

    return { recovered };
  }

  async function resolveCurrentPair(
    userId: string,
    pair: ContentGenerationPair,
    replayed: boolean,
  ): Promise<ContentGenerationResult> {
    const status = parseStoredContentGenerationStatus(pair.attempt.status);

    if (status === "FAILED") {
      const category = getFailureCategory(pair);
      const applicationError = mapFailureToApplicationError(category);
      logOperation(serviceLogger, "warn", "content.generate.failed", {
        userId,
        workspaceId: pair.attempt.workspaceId,
        attemptId: pair.attempt.id,
        aiRunId: pair.run.id,
        errorCode: applicationError.code,
        errorCategory: category,
      });
      throw applicationError;
    }

    const content =
      status === "COMPLETED"
        ? await findContentByGenerationAttemptId(
            database,
            pair.attempt.workspaceId,
            pair.attempt.id,
          )
        : undefined;

    if (status === "COMPLETED" && !content) {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The completed Content generation has no resulting Content.",
      );
    }

    return {
      attempt: toAttemptDto(pair),
      contentId: content?.id ?? null,
      replayed,
    };
  }

  async function failAfterInvocation(
    userId: string,
    workspaceId: string,
    attemptId: string,
    aiRunId: string,
    category: FailureCategory,
  ): Promise<ContentGenerationPair> {
    try {
      return await failContentGenerationInvocation(
        database,
        workspaceId,
        attemptId,
        aiRunId,
        category,
        clock,
      );
    } catch {
      logOperation(serviceLogger, "error", "content.generate.persistence_failed", {
        userId,
        workspaceId,
        attemptId,
        aiRunId,
        errorCode: "INTERNAL_ERROR",
        errorCategory: category,
      });
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The Content generation result could not be durably recorded.",
      );
    }
  }

  async function generateContentScript(input: unknown): Promise<ContentGenerationResult> {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
    }

    const parsedInput = parseRequest(input);
    const acceptance = await acceptContentGeneration(parsedInput);
    const pair = await findContentGenerationPairByIdempotencyKey(
      database,
      parsedInput.workspaceId,
      parsedInput.idempotencyKey,
    );

    if (!pair) {
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The Content generation operation was not found.",
      );
    }

    const initialStatus = parseStoredContentGenerationStatus(pair.attempt.status);

    if (initialStatus !== "PENDING") {
      return resolveCurrentPair(userId, pair, acceptance.replayed);
    }

    let invocation: Awaited<ReturnType<typeof startContentGenerationInvocation>>;

    try {
      invocation = await startContentGenerationInvocation(
        database,
        parsedInput.workspaceId,
        pair.attempt.id,
        pair.run.id,
        clock,
      );
    } catch {
      logOperation(serviceLogger, "error", "content.generate.persistence_failed", {
        userId,
        workspaceId: parsedInput.workspaceId,
        attemptId: pair.attempt.id,
        aiRunId: pair.run.id,
        errorCode: "INTERNAL_ERROR",
      });
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The Content generation operation could not start.",
      );
    }

    if (!invocation.started) {
      return resolveCurrentPair(userId, invocation.pair, true);
    }

    const runningPair = invocation.pair;

    let providerResult: GenerateContentScriptResult;

    try {
      const acceptedInputs = await loadAcceptedContentGenerationInputs(database, runningPair);
      const provider = dependencies.providerFactory
        ? await dependencies.providerFactory(userId)
        : undefined;

      if (!provider) {
        throw new Error("The Content Script provider is not configured.");
      }

      providerResult = parseGenerateContentScriptResult(
        await provider.generateContentScript({
          generationKind: "CONTENT_SCRIPT_GENERATION",
          sourceIdea: acceptedInputs.sourceIdea,
          contentDna: acceptedInputs.contentDna,
          requestedLanguage: runningPair.attempt.requestedLanguage,
          format: runningPair.attempt.format,
          ...(runningPair.attempt.instructions === null
            ? {}
            : { instructions: runningPair.attempt.instructions }),
        }),
      );
    } catch {
      providerResult = createGenerateContentScriptFailure("UNKNOWN");
    }

    if (!providerResult.ok) {
      const failedPair = await failAfterInvocation(
        userId,
        parsedInput.workspaceId,
        runningPair.attempt.id,
        runningPair.run.id,
        providerResult.errorCategory,
      );

      if (failedPair.attempt.status === "COMPLETED") {
        return resolveCurrentPair(userId, failedPair, false);
      }

      const applicationError = mapFailureToApplicationError(
        getFailureCategory(failedPair),
        "provider",
      );
      logOperation(serviceLogger, "warn", "content.generate.failed", {
        userId,
        workspaceId: parsedInput.workspaceId,
        attemptId: failedPair.attempt.id,
        aiRunId: failedPair.run.id,
        errorCode: applicationError.code,
        errorCategory: getFailureCategory(failedPair),
        transition: "RUNNING->FAILED",
      });
      throw applicationError;
    }

    let completion: Awaited<ReturnType<typeof completeContentGenerationInvocation>>;

    try {
      completion = await completeContentGenerationInvocation(
        database,
        parsedInput.workspaceId,
        runningPair.attempt.id,
        runningPair.run.id,
        userId,
        providerResult,
        clock,
      );
    } catch {
      logOperation(serviceLogger, "error", "content.generate.persistence_failed", {
        userId,
        workspaceId: parsedInput.workspaceId,
        attemptId: runningPair.attempt.id,
        aiRunId: runningPair.run.id,
        errorCode: "INTERNAL_ERROR",
      });
      throw new ApplicationError(
        "INTERNAL_ERROR",
        "The Content generation result could not be durably recorded.",
      );
    }

    if (!completion.completed) {
      return resolveCurrentPair(userId, completion.pair, false);
    }

    logOperation(serviceLogger, "info", "content.generate.completed", {
      userId,
      workspaceId: parsedInput.workspaceId,
      attemptId: completion.pair.attempt.id,
      aiRunId: completion.pair.run.id,
      transition: "RUNNING->COMPLETED",
    });

    return {
      attempt: toAttemptDto(completion.pair),
      contentId: completion.contentId,
      replayed: false,
    };
  }

  return {
    acceptContentGeneration,
    generateContentScript,
    recoverStalePendingAttempts,
    recoverStaleRunningAttempts,
  };
}

export { failContentGenerationPairInTransaction };
