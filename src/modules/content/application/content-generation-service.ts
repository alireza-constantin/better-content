import "server-only";

import { z } from "zod";

import { db } from "@/db";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError, type RateLimitSource } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
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
  findContentGenerationPairByIdempotencyKey,
  lockContentGenerationWorkspace,
  parseStoredContentGenerationErrorCategory,
  parseStoredContentGenerationStatus,
  recoverStalePendingContentGenerationAttemptsInTransaction,
  reserveContentGenerationOperation,
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

export type ContentGenerationApplicationServiceDependencies = Readonly<{
  database?: typeof db;
  getAuthenticatedUserId?: () => Promise<string | null>;
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
  }>,
): void {
  serviceLogger[level](event, {
    userId: context.userId,
    workspaceId: context.workspaceId,
    ...(context.attemptId ? { entityId: context.attemptId } : {}),
    ...(context.aiRunId ? { aiRunId: context.aiRunId } : {}),
    module: "content",
    operation: "acceptContentGeneration",
    ...(context.errorCode ? { errorCode: context.errorCode } : {}),
    ...(context.errorCategory ? { errorCategory: context.errorCategory } : {}),
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
  generateContentScript(input: unknown): Promise<ContentGenerationAcceptanceResult>;
  recoverStalePendingAttempts(input: unknown): Promise<Readonly<{ recovered: number }>>;
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

  return {
    acceptContentGeneration,
    generateContentScript: acceptContentGeneration,
    recoverStalePendingAttempts,
  };
}

export { failContentGenerationPairInTransaction };
