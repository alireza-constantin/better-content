import "server-only";

import { z } from "zod";

import { db } from "@/db";
import { getServerSession } from "@/lib/auth/server";
import {
  ApplicationError,
  type ApplicationErrorCode,
  type RateLimitSource,
} from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import {
  createGenerateIdeasFailure,
  parseGenerateIdeasResult,
  type GenerateIdeasProvider,
  type GenerateIdeasResult,
} from "@/modules/ai/domain/generate-ideas";
import {
  fingerprintIdeaGenerationRequest,
  generationLanguageSchema,
  type FailureCategory,
  type GenerationLanguage,
  type GenerationLifecycle,
} from "@/modules/ideas/domain";
import { requireWorkspaceOwner } from "@/modules/workspace/application";

import {
  completeGenerationInvocation,
  failGenerationInvocation,
  findPairByIdempotencyKey,
  lockGenerationWorkspace,
  parseStoredBatchStatus,
  parseStoredErrorCategory,
  recoverStaleAttemptsInTransaction,
  reserveGenerationOperation,
  startGenerationInvocation,
  type GenerationPair,
  type GenerationPreflightResult,
} from "./generation-repository";

export { ideaGenerationSettings } from "./generation-repository";

const IDEA_GENERATION_KIND = "IDEA_GENERATION" as const;
const IDEA_GENERATION_COUNT = 20 as const;
const IDEA_GENERATION_PROMPT_VERSION = "idea-generation/v1" as const;

const generationInputSchema = z
  .object({
    workspaceId: z.uuid(),
    baseContentDnaVersionId: z.uuid(),
    requestedLanguage: generationLanguageSchema,
    idempotencyKey: z.uuid(),
  })
  .strict();

const recoveryInputSchema = z.object({ workspaceId: z.uuid() }).strict();

export type GenerateIdeasInput = z.input<typeof generationInputSchema>;

export type IdeaGenerationBatchDto = Readonly<{
  id: string;
  aiRunId: string;
  contentDnaVersionId: string;
  requestedLanguage: GenerationLanguage;
  requestedCount: 20;
  status: GenerationLifecycle;
  errorCategory: FailureCategory | null;
  rateLimitSource: RateLimitSource | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
}>;

export type IdeaGenerationResult = Readonly<{
  batch: IdeaGenerationBatchDto;
  replayed: boolean;
}>;

export type IdeaGenerationApplicationServiceDependencies = Readonly<{
  database?: typeof db;
  getAuthenticatedUserId?: () => Promise<string | null>;
  providerFactory: (userId: string) => GenerateIdeasProvider | Promise<GenerateIdeasProvider>;
  clock?: () => Date;
  logger?: Pick<typeof logger, "info" | "warn" | "error">;
}>;

async function getServerAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession();

  return session?.user.id ?? null;
}

function parseGenerationInput(input: unknown): GenerateIdeasInput {
  const result = generationInputSchema.safeParse(input);

  if (!result.success) {
    throw new ApplicationError("VALIDATION_ERROR", "The idea generation request is invalid.");
  }

  return result.data;
}

function parseRecoveryInput(input: unknown): z.infer<typeof recoveryInputSchema> {
  const result = recoveryInputSchema.safeParse(input);

  if (!result.success) {
    throw new ApplicationError("VALIDATION_ERROR", "The recovery request is invalid.");
  }

  return result.data;
}

function toBatchDto(batch: GenerationPair["batch"]): IdeaGenerationBatchDto {
  if (batch.requestedCount !== IDEA_GENERATION_COUNT) {
    throw new ApplicationError("INTERNAL_ERROR", "The generation count invariant is invalid.");
  }

  const requestedLanguage = generationLanguageSchema.safeParse(batch.requestedLanguage);

  if (!requestedLanguage.success) {
    throw new ApplicationError("INTERNAL_ERROR", "The generation language invariant is invalid.");
  }

  const status = parseStoredBatchStatus(batch.status);
  const errorCategory = parseStoredErrorCategory(batch.errorCategory);

  return {
    id: batch.id,
    aiRunId: batch.aiRunId,
    contentDnaVersionId: batch.contentDnaVersionId,
    requestedLanguage: requestedLanguage.data,
    requestedCount: IDEA_GENERATION_COUNT,
    status,
    errorCategory,
    rateLimitSource: status === "FAILED" && errorCategory === "RATE_LIMITED" ? "provider" : null,
    createdAt: batch.createdAt,
    startedAt: batch.startedAt,
    completedAt: batch.completedAt,
    failedAt: batch.failedAt,
  };
}

function toPairResult(pair: GenerationPair, replayed: boolean): IdeaGenerationResult {
  return { batch: toBatchDto(pair.batch), replayed };
}

function mapFailureToApplicationError(
  category: FailureCategory,
  rateLimitSource: RateLimitSource = "provider",
): ApplicationError {
  const code: ApplicationErrorCode =
    category === "RATE_LIMITED"
      ? "RATE_LIMITED"
      : category === "INVALID_OUTPUT"
        ? "AI_OUTPUT_INVALID"
        : "PROVIDER_ERROR";
  const messageByCode: Record<"RATE_LIMITED" | "AI_OUTPUT_INVALID" | "PROVIDER_ERROR", string> = {
    RATE_LIMITED: "Idea generation is temporarily rate limited.",
    AI_OUTPUT_INVALID: "The AI returned an invalid idea-generation result.",
    PROVIDER_ERROR: "Idea generation could not be completed.",
  };

  return new ApplicationError(
    code,
    messageByCode[code],
    category === "RATE_LIMITED" ? { rateLimitSource } : undefined,
  );
}

function getFailureCategory(pair: GenerationPair): FailureCategory {
  return parseStoredErrorCategory(pair.batch.errorCategory) ?? "UNKNOWN";
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function logOperation(
  serviceLogger: Pick<typeof logger, "info" | "warn" | "error">,
  level: "info" | "warn" | "error",
  event: string,
  context: Readonly<{
    userId: string;
    workspaceId: string;
    errorCode?: ApplicationErrorCode;
    batchId?: string;
    aiRunId?: string;
    transition?: string;
    errorCategory?: FailureCategory;
    durationMs?: number;
  }>,
): void {
  serviceLogger[level](event, {
    userId: context.userId,
    workspaceId: context.workspaceId,
    ...(context.batchId ? { entityId: context.batchId } : {}),
    ...(context.aiRunId ? { aiRunId: context.aiRunId } : {}),
    module: "ideas",
    operation: "generateIdeas",
    ...(context.errorCode ? { errorCode: context.errorCode } : {}),
    ...(context.transition ? { transition: context.transition } : {}),
    ...(context.errorCategory ? { errorCategory: context.errorCategory } : {}),
    ...(context.durationMs === undefined ? {} : { durationMs: context.durationMs }),
  });
}

async function resolveUniqueRace(
  database: typeof db,
  workspaceId: string,
  idempotencyKey: string,
  fingerprint: string,
): Promise<GenerationPreflightResult> {
  const existing = await findPairByIdempotencyKey(database, workspaceId, idempotencyKey);

  if (!existing) {
    throw new ApplicationError("INTERNAL_ERROR", "The generation operation could not be reserved.");
  }

  if (existing.batch.requestFingerprint !== fingerprint) {
    throw new ApplicationError(
      "CONFLICT",
      "The idempotency key was already used for a different generation request.",
    );
  }

  return { kind: "replay", pair: existing };
}

export function createIdeaGenerationApplicationService(
  dependencies: IdeaGenerationApplicationServiceDependencies,
): Readonly<{
  generateIdeas(input: unknown): Promise<IdeaGenerationResult>;
  recoverStaleAttempts(input: unknown): Promise<Readonly<{ recovered: number }>>;
}> {
  const database = dependencies.database ?? db;
  const getAuthenticatedUserId =
    dependencies.getAuthenticatedUserId ?? getServerAuthenticatedUserId;
  const clock = dependencies.clock ?? (() => new Date());
  const serviceLogger = dependencies.logger ?? logger;

  return {
    async generateIdeas(input: unknown): Promise<IdeaGenerationResult> {
      const userId = await getAuthenticatedUserId();

      if (!userId) {
        throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      }

      const parsedInput = parseGenerationInput(input);
      await requireWorkspaceOwner(userId, parsedInput.workspaceId, database);
      const fingerprint = fingerprintIdeaGenerationRequest({
        generationKind: IDEA_GENERATION_KIND,
        baseContentDnaVersionId: parsedInput.baseContentDnaVersionId,
        requestedLanguage: parsedInput.requestedLanguage,
        requestedCount: IDEA_GENERATION_COUNT,
      });
      let preflight: GenerationPreflightResult;

      try {
        preflight = await database.transaction(async (transaction) =>
          reserveGenerationOperation(transaction, userId, parsedInput, fingerprint, clock),
        );
      } catch (error) {
        if (!isUniqueViolation(error)) {
          logOperation(serviceLogger, "warn", "ideas.generate.preflight_failed", {
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
        logOperation(serviceLogger, "warn", "ideas.generate.rate_limited", {
          userId,
          workspaceId: parsedInput.workspaceId,
          errorCode: "RATE_LIMITED",
        });
        throw new ApplicationError("RATE_LIMITED", "Idea generation is temporarily rate limited.", {
          rateLimitSource: "workspace",
        });
      }

      if (preflight.kind === "replay") {
        logOperation(serviceLogger, "info", "ideas.generate.replayed", {
          userId,
          workspaceId: parsedInput.workspaceId,
          batchId: preflight.pair.batch.id,
          aiRunId: preflight.pair.run.id,
          ...(preflight.pair.batch.status === "FAILED"
            ? { errorCategory: getFailureCategory(preflight.pair) }
            : {}),
        });
        return toPairResult(preflight.pair, true);
      }

      let provider: GenerateIdeasProvider;

      try {
        provider = await dependencies.providerFactory(userId);
      } catch {
        const failedPair = await failGenerationInvocation(
          database,
          parsedInput.workspaceId,
          preflight.pair.batch.id,
          preflight.pair.run.id,
          "UNKNOWN",
          clock,
        );
        const applicationError = mapFailureToApplicationError(getFailureCategory(failedPair));
        logOperation(serviceLogger, "warn", "ideas.generate.failed", {
          userId,
          workspaceId: parsedInput.workspaceId,
          batchId: failedPair.batch.id,
          aiRunId: failedPair.run.id,
          transition: "PENDING->FAILED",
          errorCategory: getFailureCategory(failedPair),
          errorCode: applicationError.code,
        });
        throw applicationError;
      }

      const invocation = await startGenerationInvocation(
        database,
        parsedInput.workspaceId,
        preflight.pair.batch.id,
        preflight.pair.run.id,
        clock,
      );

      if (!invocation.started) {
        if (invocation.pair.batch.status === "FAILED") {
          const applicationError = mapFailureToApplicationError(
            getFailureCategory(invocation.pair),
          );
          logOperation(serviceLogger, "warn", "ideas.generate.failed", {
            userId,
            workspaceId: parsedInput.workspaceId,
            batchId: invocation.pair.batch.id,
            aiRunId: invocation.pair.run.id,
            transition: "PENDING->FAILED",
            errorCategory: getFailureCategory(invocation.pair),
            errorCode: applicationError.code,
          });
          throw applicationError;
        }

        return toPairResult(invocation.pair, true);
      }

      logOperation(serviceLogger, "info", "ideas.generate.running", {
        userId,
        workspaceId: parsedInput.workspaceId,
        batchId: invocation.pair.batch.id,
        aiRunId: invocation.pair.run.id,
        transition: "PENDING->RUNNING",
      });

      let providerResult: GenerateIdeasResult;

      try {
        providerResult = parseGenerateIdeasResult(
          await provider.generateIdeas({
            generationKind: IDEA_GENERATION_KIND,
            contentDna: preflight.contentDna,
            requestedLanguage: parsedInput.requestedLanguage,
            requestedCount: IDEA_GENERATION_COUNT,
            promptVersion: IDEA_GENERATION_PROMPT_VERSION,
          }),
        );
      } catch {
        providerResult = createGenerateIdeasFailure("UNKNOWN");
      }

      if (!providerResult.ok) {
        const failedPair = await failGenerationInvocation(
          database,
          parsedInput.workspaceId,
          preflight.pair.batch.id,
          preflight.pair.run.id,
          providerResult.errorCategory,
          clock,
        );

        if (failedPair.batch.status === "COMPLETED") {
          return toPairResult(failedPair, false);
        }

        const applicationError = mapFailureToApplicationError(getFailureCategory(failedPair));
        logOperation(serviceLogger, "warn", "ideas.generate.failed", {
          userId,
          workspaceId: parsedInput.workspaceId,
          batchId: failedPair.batch.id,
          aiRunId: failedPair.run.id,
          transition: "RUNNING->FAILED",
          errorCategory: getFailureCategory(failedPair),
          errorCode: applicationError.code,
        });
        throw applicationError;
      }

      const completion = await completeGenerationInvocation(
        database,
        parsedInput.workspaceId,
        preflight.pair.batch.id,
        preflight.pair.run.id,
        providerResult,
        clock,
      );

      if (!completion.completed) {
        if (completion.pair.batch.status === "FAILED") {
          const applicationError = mapFailureToApplicationError(
            getFailureCategory(completion.pair),
          );
          logOperation(serviceLogger, "warn", "ideas.generate.failed", {
            userId,
            workspaceId: parsedInput.workspaceId,
            batchId: completion.pair.batch.id,
            aiRunId: completion.pair.run.id,
            transition: "RUNNING->FAILED",
            errorCategory: getFailureCategory(completion.pair),
            errorCode: applicationError.code,
          });
          throw applicationError;
        }

        return toPairResult(completion.pair, false);
      }

      logOperation(serviceLogger, "info", "ideas.generate.completed", {
        userId,
        workspaceId: parsedInput.workspaceId,
        batchId: completion.pair.batch.id,
        aiRunId: completion.pair.run.id,
        transition: "RUNNING->COMPLETED",
      });
      return toPairResult(completion.pair, false);
    },

    async recoverStaleAttempts(input: unknown): Promise<Readonly<{ recovered: number }>> {
      const userId = await getAuthenticatedUserId();

      if (!userId) {
        throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      }

      const { workspaceId } = parseRecoveryInput(input);
      await requireWorkspaceOwner(userId, workspaceId, database);
      const recovered = await database.transaction(async (transaction) => {
        await lockGenerationWorkspace(transaction, workspaceId);
        return recoverStaleAttemptsInTransaction(transaction, workspaceId, clock());
      });

      if (recovered > 0) {
        logOperation(serviceLogger, "info", "ideas.generate.stale_recovered", {
          userId,
          workspaceId,
        });
      }

      return { recovered };
    },
  };
}
