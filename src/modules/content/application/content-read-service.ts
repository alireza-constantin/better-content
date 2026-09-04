import "server-only";

import { z } from "zod";

import { db } from "@/db";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError, type RateLimitSource } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import {
  contentScriptDocumentSchema,
  contentScriptFormatSchema,
  generationLanguageSchema,
  type ContentScriptDocument,
  type ContentScriptFormat,
  type GenerationLanguage,
} from "../domain";
import {
  parseStoredContentGenerationErrorCategory,
  parseStoredContentGenerationStatus,
  lockContentGenerationWorkspace,
  recoverStalePendingContentGenerationAttemptsInTransaction,
  recoverStaleRunningContentGenerationAttemptsInTransaction,
} from "./content-generation-repository";
import {
  findContentDetail,
  findContentGenerationAttemptDetail,
  findIdeaContentUsage,
  findResultingContentDetail,
  findSourceIdea,
  listContent as listContentRecords,
  listContentGenerationAttemptsForIdea,
  type ContentDetailRecord,
  type ContentGenerationAttemptReadRecord,
  type ContentListRecord,
} from "./content-read-repository";
import { requireWorkspaceMembership } from "@/modules/workspace/application";
import type { FailureCategory, GenerationLifecycle } from "@/modules/ai/domain/ai-contracts";

const workspaceInputSchema = z.object({ workspaceId: z.uuid() }).strict();
const contentDetailInputSchema = z.object({ workspaceId: z.uuid(), contentId: z.uuid() }).strict();
const ideaHistoryInputSchema = z.object({ workspaceId: z.uuid(), sourceIdeaId: z.uuid() }).strict();
const attemptDetailInputSchema = z.object({ workspaceId: z.uuid(), attemptId: z.uuid() }).strict();

type ContentReadLogger = Pick<typeof logger, "info" | "warn">;

export type ContentSourceIdeaDto = Readonly<{
  id: string;
  title: string;
}>;

export type ContentListItemDto = Readonly<{
  id: string;
  sourceIdeaTitle: string;
  format: ContentScriptFormat;
  contentLanguage: GenerationLanguage;
  lastEditedAt: Date;
}>;

export type ContentDraftDto = Readonly<{
  document: ContentScriptDocument;
  revision: number;
  updatedAt: Date;
}>;

export type ContentDetailDto = Readonly<{
  id: string;
  sourceIdea: ContentSourceIdeaDto;
  contentLanguage: GenerationLanguage;
  format: ContentScriptFormat;
  draft: ContentDraftDto;
}>;

export type ContentGenerationAttemptHistoryDto = Readonly<{
  id: string;
  status: GenerationLifecycle;
  errorCategory: FailureCategory | null;
  rateLimitSource: RateLimitSource | null;
  requestedLanguage: GenerationLanguage;
  format: ContentScriptFormat;
  instructions: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  resultingContentId: string | null;
}>;

export type ContentGenerationAttemptDetailDto = Readonly<{
  attempt: ContentGenerationAttemptHistoryDto;
  sourceIdea: ContentSourceIdeaDto;
}>;

export type IdeaContentGenerationHistoryDto = Readonly<{
  sourceIdea: ContentSourceIdeaDto;
  isUsed: boolean;
  attempts: readonly ContentGenerationAttemptHistoryDto[];
}>;

export type IdeaContentUsageDto = Readonly<{
  ideaId: string;
  isUsed: boolean;
}>;

export type ContentReadApplicationServiceDependencies = Readonly<{
  database?: typeof db;
  getAuthenticatedUserId?: () => Promise<string | null>;
  clock?: () => Date;
  logger?: ContentReadLogger;
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

function notFound(resource: string): ApplicationError {
  return new ApplicationError("NOT_FOUND", `The requested ${resource} was not found.`);
}

function parseStoredContentLanguage(value: string): GenerationLanguage {
  const result = generationLanguageSchema.safeParse(value);

  if (!result.success) {
    throw new ApplicationError("INTERNAL_ERROR", "The Content language invariant is invalid.");
  }

  return result.data;
}

function parseStoredContentFormat(value: string): ContentScriptFormat {
  const result = contentScriptFormatSchema.safeParse(value);

  if (!result.success) {
    throw new ApplicationError("INTERNAL_ERROR", "The Content format invariant is invalid.");
  }

  return result.data;
}

function parseStoredDraftDocument(value: unknown): ContentScriptDocument {
  const result = contentScriptDocumentSchema.safeParse(value);

  if (!result.success) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The Content Draft document invariant is invalid.",
    );
  }

  return result.data;
}

function toContentListItem(record: ContentListRecord): ContentListItemDto {
  return {
    id: record.content.id,
    sourceIdeaTitle: record.sourceIdeaTitle,
    format: parseStoredContentFormat(record.content.format),
    contentLanguage: parseStoredContentLanguage(record.content.contentLanguage),
    lastEditedAt: record.draft.updatedAt,
  };
}

function toContentDetail(record: ContentDetailRecord): ContentDetailDto {
  return {
    id: record.content.id,
    sourceIdea: {
      id: record.sourceIdea.id,
      title: record.sourceIdea.title,
    },
    contentLanguage: parseStoredContentLanguage(record.content.contentLanguage),
    format: parseStoredContentFormat(record.content.format),
    draft: {
      document: parseStoredDraftDocument(record.draft.document),
      revision: record.draft.revision,
      updatedAt: record.draft.updatedAt,
    },
  };
}

function toAttemptHistory(
  record: ContentGenerationAttemptReadRecord,
): ContentGenerationAttemptHistoryDto {
  const requestedLanguage = parseStoredContentLanguage(record.attempt.requestedLanguage);
  const format = parseStoredContentFormat(record.attempt.format);
  const status = parseStoredContentGenerationStatus(record.attempt.status);
  const errorCategory = parseStoredContentGenerationErrorCategory(record.attempt.errorCategory);

  if (status === "COMPLETED" && record.resultingContentId === null) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The completed Content generation has no resulting Content.",
    );
  }

  if (status !== "COMPLETED" && record.resultingContentId !== null) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "An active or failed Content generation has a resulting Content.",
    );
  }

  return {
    id: record.attempt.id,
    status,
    errorCategory,
    rateLimitSource: status === "FAILED" && errorCategory === "RATE_LIMITED" ? "provider" : null,
    requestedLanguage,
    format,
    instructions: record.attempt.instructions,
    createdAt: record.attempt.createdAt,
    startedAt: record.attempt.startedAt,
    completedAt: record.attempt.completedAt,
    failedAt: record.attempt.failedAt,
    resultingContentId: record.resultingContentId,
  };
}

async function recoverStaleForAuthorizedRead(
  database: typeof db,
  userId: string,
  workspaceId: string,
  clock: () => Date,
): Promise<number> {
  return database.transaction(async (transaction) => {
    await lockContentGenerationWorkspace(transaction, workspaceId);
    await requireWorkspaceMembership(userId, workspaceId, transaction);
    const recoveredAt = clock();
    const pending = await recoverStalePendingContentGenerationAttemptsInTransaction(
      transaction,
      workspaceId,
      recoveredAt,
    );
    const running = await recoverStaleRunningContentGenerationAttemptsInTransaction(
      transaction,
      workspaceId,
      recoveredAt,
    );

    return pending + running;
  });
}

function logRead(
  serviceLogger: ContentReadLogger,
  event: string,
  context: Readonly<{ userId: string; workspaceId: string; entityId?: string }>,
): void {
  serviceLogger.info(event, {
    userId: context.userId,
    workspaceId: context.workspaceId,
    ...(context.entityId ? { entityId: context.entityId } : {}),
    module: "content",
    operation: "contentRead",
  });
}

export function createContentReadApplicationService(
  dependencies: ContentReadApplicationServiceDependencies = {},
): Readonly<{
  listContent(input: unknown): Promise<readonly ContentListItemDto[]>;
  getContentDetail(input: unknown): Promise<ContentDetailDto>;
  getIdeaContentGenerationHistory(input: unknown): Promise<IdeaContentGenerationHistoryDto>;
  getContentGenerationAttemptDetail(input: unknown): Promise<ContentGenerationAttemptDetailDto>;
  getContentGenerationAttemptResult(input: unknown): Promise<ContentDetailDto | null>;
  getIdeaContentUsage(input: unknown): Promise<IdeaContentUsageDto>;
}> {
  const database = dependencies.database ?? db;
  const getAuthenticatedUserId =
    dependencies.getAuthenticatedUserId ?? getServerAuthenticatedUserId;
  const clock = dependencies.clock ?? (() => new Date());
  const serviceLogger = dependencies.logger ?? logger;

  async function authorizeRead<T extends Readonly<{ workspaceId: string }>>(
    input: unknown,
    schema: z.ZodType<T>,
    message: string,
  ): Promise<{ userId: string; input: T }> {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
    }

    const parsedInput = parseInput(schema, input, message);
    await requireWorkspaceMembership(userId, parsedInput.workspaceId, database);

    return { userId, input: parsedInput };
  }

  async function recoverActiveOperations(userId: string, workspaceId: string): Promise<void> {
    const recovered = await recoverStaleForAuthorizedRead(database, userId, workspaceId, clock);

    if (recovered > 0) {
      serviceLogger.info("content.read.stale_recovered", {
        workspaceId,
        module: "content",
        operation: "contentRead",
      });
    }
  }

  return {
    async listContent(input: unknown): Promise<readonly ContentListItemDto[]> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        workspaceInputSchema,
        "The Content list request is invalid.",
      );
      const records = await listContentRecords(database, parsedInput.workspaceId);
      const result = records.map(toContentListItem);

      logRead(serviceLogger, "content.list.loaded", {
        userId,
        workspaceId: parsedInput.workspaceId,
      });

      return result;
    },

    async getContentDetail(input: unknown): Promise<ContentDetailDto> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        contentDetailInputSchema,
        "The Content detail request is invalid.",
      );
      const record = await findContentDetail(
        database,
        parsedInput.workspaceId,
        parsedInput.contentId,
      );

      if (!record) {
        throw notFound("Content");
      }

      logRead(serviceLogger, "content.detail.loaded", {
        userId,
        workspaceId: parsedInput.workspaceId,
        entityId: parsedInput.contentId,
      });

      return toContentDetail(record);
    },

    async getIdeaContentGenerationHistory(
      input: unknown,
    ): Promise<IdeaContentGenerationHistoryDto> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        ideaHistoryInputSchema,
        "The Content generation history request is invalid.",
      );
      await recoverActiveOperations(userId, parsedInput.workspaceId);

      const sourceIdea = await findSourceIdea(
        database,
        parsedInput.workspaceId,
        parsedInput.sourceIdeaId,
      );

      if (!sourceIdea) {
        throw notFound("source Idea");
      }

      const [records, isUsed] = await Promise.all([
        listContentGenerationAttemptsForIdea(
          database,
          parsedInput.workspaceId,
          parsedInput.sourceIdeaId,
        ),
        findIdeaContentUsage(database, parsedInput.workspaceId, parsedInput.sourceIdeaId),
      ]);

      logRead(serviceLogger, "content.attempt_history.loaded", {
        userId,
        workspaceId: parsedInput.workspaceId,
        entityId: parsedInput.sourceIdeaId,
      });

      return {
        sourceIdea,
        isUsed,
        attempts: records.map(toAttemptHistory),
      };
    },

    async getContentGenerationAttemptDetail(
      input: unknown,
    ): Promise<ContentGenerationAttemptDetailDto> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        attemptDetailInputSchema,
        "The Content generation Attempt request is invalid.",
      );
      await recoverActiveOperations(userId, parsedInput.workspaceId);

      const record = await findContentGenerationAttemptDetail(
        database,
        parsedInput.workspaceId,
        parsedInput.attemptId,
      );

      if (!record) {
        throw notFound("Content generation Attempt");
      }

      logRead(serviceLogger, "content.attempt_detail.loaded", {
        userId,
        workspaceId: parsedInput.workspaceId,
        entityId: parsedInput.attemptId,
      });

      return {
        attempt: toAttemptHistory(record),
        sourceIdea: record.sourceIdea,
      };
    },

    async getContentGenerationAttemptResult(input: unknown): Promise<ContentDetailDto | null> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        attemptDetailInputSchema,
        "The Content generation result request is invalid.",
      );
      await recoverActiveOperations(userId, parsedInput.workspaceId);

      const attempt = await findContentGenerationAttemptDetail(
        database,
        parsedInput.workspaceId,
        parsedInput.attemptId,
      );

      if (!attempt) {
        throw notFound("Content generation Attempt");
      }

      const attemptDto = toAttemptHistory(attempt);

      if (!attemptDto.resultingContentId) {
        return null;
      }

      const result = await findResultingContentDetail(
        database,
        parsedInput.workspaceId,
        parsedInput.attemptId,
      );

      if (!result) {
        throw new ApplicationError(
          "INTERNAL_ERROR",
          "The resulting Content detail could not be loaded.",
        );
      }

      logRead(serviceLogger, "content.attempt_result.loaded", {
        userId,
        workspaceId: parsedInput.workspaceId,
        entityId: parsedInput.attemptId,
      });

      return toContentDetail(result);
    },

    async getIdeaContentUsage(input: unknown): Promise<IdeaContentUsageDto> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        ideaHistoryInputSchema,
        "The Idea Content usage request is invalid.",
      );
      const sourceIdea = await findSourceIdea(
        database,
        parsedInput.workspaceId,
        parsedInput.sourceIdeaId,
      );

      if (!sourceIdea) {
        throw notFound("source Idea");
      }

      const isUsed = await findIdeaContentUsage(
        database,
        parsedInput.workspaceId,
        parsedInput.sourceIdeaId,
      );

      logRead(serviceLogger, "content.idea_usage.loaded", {
        userId,
        workspaceId: parsedInput.workspaceId,
        entityId: parsedInput.sourceIdeaId,
      });

      return { ideaId: parsedInput.sourceIdeaId, isUsed };
    },
  };
}
