import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { db } from "@/db";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError, type ApplicationErrorCode } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import {
  generationLanguageSchema,
  type FailureCategory,
  type GenerationLanguage,
  type GenerationLifecycle,
} from "@/modules/ideas/domain";
import { requireWorkspaceMembership, requireWorkspaceOwner } from "@/modules/workspace/application";

import {
  findIdeaGenerationBatchDetail,
  listIdeaGenerationBatchHistory,
  type IdeaGenerationBatchDetailRecord,
  type IdeaGenerationBatchHistoryRecord,
} from "./batch-history-repository";
import {
  lockGenerationWorkspace,
  parseStoredBatchStatus,
  parseStoredErrorCategory,
  recoverStaleAttemptsInTransaction,
} from "./generation-repository";
import { findCurrentContentDnaVersion } from "./generation-dna-repository";
import type { IdeaGenerationResult } from "./generation-service";
import { toIdeaDto, type IdeaDto } from "./idea-dto";

const historyInputSchema = z.object({ workspaceId: z.uuid() }).strict();
const detailInputSchema = z.object({ workspaceId: z.uuid(), batchId: z.uuid() }).strict();

type BatchHistoryLogger = Pick<typeof logger, "info" | "warn">;
type StaleRecovery = (
  input: Readonly<{ workspaceId: string }>,
) => Promise<Readonly<{ recovered: number }>>;
type GenerateIdeas = (input: unknown) => Promise<IdeaGenerationResult>;

export type IdeaGenerationBatchHistoryDto = Readonly<{
  id: string;
  contentDnaVersionId: string;
  contentDnaVersionNumber: number;
  requestedLanguage: GenerationLanguage;
  requestedCount: 20;
  status: GenerationLifecycle;
  errorCategory: FailureCategory | null;
  ideaCount: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
}>;

export type IdeaGenerationBatchDetailDto = Readonly<
  IdeaGenerationBatchHistoryDto & {
    ideas: readonly IdeaDto[];
    canRetry: boolean;
  }
>;

export type IdeaGenerationBatchHistoryResult = Readonly<{
  batches: readonly IdeaGenerationBatchHistoryDto[];
  selectedBatchId: string | null;
}>;

export type IdeaGenerationBatchApplicationServiceDependencies = Readonly<{
  database?: typeof db;
  getAuthenticatedUserId?: () => Promise<string | null>;
  recoverStaleAttempts?: StaleRecovery;
  generateIdeas?: GenerateIdeas;
  clock?: () => Date;
  logger?: BatchHistoryLogger;
}>;

async function getServerAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession();

  return session?.user.id ?? null;
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new ApplicationError("VALIDATION_ERROR", message);
  }

  return result.data;
}

function toHistoryDto(record: IdeaGenerationBatchHistoryRecord): IdeaGenerationBatchHistoryDto {
  if (record.batch.requestedCount !== 20) {
    throw new ApplicationError("INTERNAL_ERROR", "The generation count invariant is invalid.");
  }

  const requestedLanguage = generationLanguageSchema.safeParse(record.batch.requestedLanguage);

  if (!requestedLanguage.success) {
    throw new ApplicationError("INTERNAL_ERROR", "The generation language invariant is invalid.");
  }

  return {
    id: record.batch.id,
    contentDnaVersionId: record.batch.contentDnaVersionId,
    contentDnaVersionNumber: record.contentDnaVersionNumber,
    requestedLanguage: requestedLanguage.data,
    requestedCount: 20,
    status: parseStoredBatchStatus(record.batch.status),
    errorCategory: parseStoredErrorCategory(record.batch.errorCategory),
    ideaCount: record.ideaCount,
    createdAt: record.batch.createdAt,
    startedAt: record.batch.startedAt,
    completedAt: record.batch.completedAt,
    failedAt: record.batch.failedAt,
  };
}

function toDetailDto(record: IdeaGenerationBatchDetailRecord): IdeaGenerationBatchDetailDto {
  const history = toHistoryDto(record);

  if (history.status === "COMPLETED" && record.ideaCount !== 20) {
    throw new ApplicationError("INTERNAL_ERROR", "The completed generation count is invalid.");
  }

  return {
    ...history,
    ideas: history.status === "COMPLETED" ? record.ideas.map(toIdeaDto) : [],
    canRetry: history.status === "FAILED",
  };
}

function selectInitialBatchId(batches: readonly IdeaGenerationBatchHistoryDto[]): string | null {
  const newest = batches[0];

  if (!newest) {
    return null;
  }

  if (newest.status !== "COMPLETED") {
    return newest.id;
  }

  return batches.find((batch) => batch.status === "COMPLETED")?.id ?? newest.id;
}

function notFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "The idea generation batch was not found.");
}

function logOperation(
  serviceLogger: BatchHistoryLogger,
  level: "info" | "warn",
  event: string,
  context: Readonly<{
    userId: string;
    workspaceId: string;
    batchId?: string;
    errorCode?: ApplicationErrorCode;
  }>,
): void {
  serviceLogger[level](event, {
    userId: context.userId,
    workspaceId: context.workspaceId,
    ...(context.batchId ? { entityId: context.batchId } : {}),
    module: "ideas",
    operation: "ideaGenerationBatchHistory",
    ...(context.errorCode ? { errorCode: context.errorCode } : {}),
  });
}

async function recoverStaleAttemptsForAuthorizedWorkspace(
  database: typeof db,
  workspaceId: string,
  clock: () => Date,
): Promise<Readonly<{ recovered: number }>> {
  const recovered = await database.transaction(async (transaction) => {
    await lockGenerationWorkspace(transaction, workspaceId);
    return recoverStaleAttemptsInTransaction(transaction, workspaceId, clock());
  });

  return { recovered };
}

export function createIdeaGenerationBatchApplicationService(
  dependencies: IdeaGenerationBatchApplicationServiceDependencies = {},
): Readonly<{
  listBatchHistory(input: unknown): Promise<readonly IdeaGenerationBatchHistoryDto[]>;
  getBatchHistory(input: unknown): Promise<IdeaGenerationBatchHistoryResult>;
  getBatchDetail(input: unknown): Promise<IdeaGenerationBatchDetailDto>;
  retryBatch(input: unknown): Promise<IdeaGenerationResult>;
}> {
  const database = dependencies.database ?? db;
  const getAuthenticatedUserId =
    dependencies.getAuthenticatedUserId ?? getServerAuthenticatedUserId;
  const clock = dependencies.clock ?? (() => new Date());
  const serviceLogger = dependencies.logger ?? logger;
  const recoverStaleAttempts =
    dependencies.recoverStaleAttempts ??
    ((input: Readonly<{ workspaceId: string }>) =>
      recoverStaleAttemptsForAuthorizedWorkspace(database, input.workspaceId, clock));

  async function authorizeRead(input: unknown): Promise<{ userId: string; workspaceId: string }> {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
    }

    const { workspaceId } = parseInput(
      historyInputSchema,
      input,
      "The idea generation history request is invalid.",
    );
    await requireWorkspaceMembership(userId, workspaceId, database);
    await recoverStaleAttempts({ workspaceId });

    return { userId, workspaceId };
  }

  async function loadHistory(input: unknown): Promise<IdeaGenerationBatchHistoryResult> {
    const { userId, workspaceId } = await authorizeRead(input);
    const records = await listIdeaGenerationBatchHistory(database, workspaceId);
    const batches = records.map(toHistoryDto);

    logOperation(serviceLogger, "info", "ideas.history.loaded", { userId, workspaceId });

    return { batches, selectedBatchId: selectInitialBatchId(batches) };
  }

  return {
    async listBatchHistory(input: unknown): Promise<readonly IdeaGenerationBatchHistoryDto[]> {
      return (await loadHistory(input)).batches;
    },

    async getBatchHistory(input: unknown): Promise<IdeaGenerationBatchHistoryResult> {
      return loadHistory(input);
    },

    async getBatchDetail(input: unknown): Promise<IdeaGenerationBatchDetailDto> {
      const userId = await getAuthenticatedUserId();

      if (!userId) {
        throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      }

      const { workspaceId, batchId } = parseInput(
        detailInputSchema,
        input,
        "The idea generation batch request is invalid.",
      );
      await requireWorkspaceMembership(userId, workspaceId, database);
      await recoverStaleAttempts({ workspaceId });

      const record = await findIdeaGenerationBatchDetail(database, workspaceId, batchId);

      if (!record) {
        logOperation(serviceLogger, "warn", "ideas.batch.not_found", {
          userId,
          workspaceId,
          batchId,
          errorCode: "NOT_FOUND",
        });
        throw notFound();
      }

      return toDetailDto(record);
    },

    async retryBatch(input: unknown): Promise<IdeaGenerationResult> {
      const userId = await getAuthenticatedUserId();

      if (!userId) {
        throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      }

      const { workspaceId, batchId } = parseInput(
        detailInputSchema,
        input,
        "The idea generation retry request is invalid.",
      );
      await requireWorkspaceOwner(userId, workspaceId, database);
      await recoverStaleAttempts({ workspaceId });

      const record = await findIdeaGenerationBatchDetail(database, workspaceId, batchId);

      if (!record) {
        throw notFound();
      }

      const batch = toHistoryDto(record);

      if (batch.status !== "FAILED") {
        throw new ApplicationError(
          "CONFLICT",
          "Only a failed idea generation batch can be retried.",
        );
      }

      const generateIdeas = dependencies.generateIdeas;

      if (!generateIdeas) {
        throw new ApplicationError(
          "INTERNAL_ERROR",
          "The idea generation retry path is unavailable.",
        );
      }

      logOperation(serviceLogger, "info", "ideas.batch.retry_started", {
        userId,
        workspaceId,
        batchId,
      });

      const currentContentDna = await findCurrentContentDnaVersion(
        database,
        workspaceId,
        batch.requestedLanguage,
      );

      return generateIdeas({
        workspaceId,
        baseContentDnaVersionId: currentContentDna.id,
        requestedLanguage: batch.requestedLanguage,
        idempotencyKey: randomUUID(),
      });
    },
  };
}
