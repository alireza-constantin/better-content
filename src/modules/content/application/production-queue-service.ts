import "server-only";

import { z } from "zod";

import { db } from "@/db";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import { decisionStateSchema, generationLanguageSchema } from "@/modules/ideas/domain";
import {
  lockWorkspaceForUpdate,
  requireWorkspaceMembership,
  requireWorkspaceOwner,
} from "@/modules/workspace/application";

import {
  listProductionQueueRecords,
  lockWorkspaceIdeasForQueueMutation,
  rewriteProductionQueuePositionsInTransaction,
  type ProductionQueueAttemptRecord,
} from "./production-queue-repository";
import { toIdeaDto, type IdeaDto } from "@/modules/ideas/application/idea-dto";

export const productionQueueReorderInputSchema = z
  .object({
    workspaceId: z.uuid(),
    orderedIdeaIds: z.array(z.uuid()),
  })
  .strict();

export const productionQueueItemSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    description: z.string(),
    language: z.enum(["en", "fa"]),
    productionQueuePosition: z.number().int().positive(),
    lastAttempt: z
      .object({
        id: z.uuid(),
        status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]),
        errorCategory: z
          .enum([
            "TIMEOUT",
            "RATE_LIMITED",
            "PROVIDER_UNAVAILABLE",
            "INVALID_OUTPUT",
            "INTERRUPTED",
            "UNKNOWN",
          ])
          .nullable(),
        createdAt: z.date(),
        failedAt: z.date().nullable(),
      })
      .nullable(),
  })
  .strict();

export type ProductionQueueItemDto = Readonly<z.infer<typeof productionQueueItemSchema>>;
export type ProductionQueueIdeaDto = Readonly<Pick<IdeaDto, "id" | "title">>;

type ProductionQueueLogger = Pick<typeof logger, "info" | "warn">;

export type ProductionQueueApplicationServiceDependencies = Readonly<{
  database?: typeof db;
  getAuthenticatedUserId?: () => Promise<string | null>;
  logger?: ProductionQueueLogger;
}>;

async function getServerAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession();

  return session?.user.id ?? null;
}

function notFoundOrConflict(): ApplicationError {
  return new ApplicationError(
    "CONFLICT",
    "The Content Production Queue changed. Reload and try again.",
  );
}

function toAttemptDto(
  attempt: ProductionQueueAttemptRecord | null,
): ProductionQueueItemDto["lastAttempt"] {
  if (!attempt) {
    return null;
  }

  const status = z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]).safeParse(attempt.status);
  const errorCategory = z
    .enum([
      "TIMEOUT",
      "RATE_LIMITED",
      "PROVIDER_UNAVAILABLE",
      "INVALID_OUTPUT",
      "INTERRUPTED",
      "UNKNOWN",
    ])
    .nullable()
    .safeParse(attempt.errorCategory);

  if (!status.success || !errorCategory.success) {
    throw new ApplicationError("INTERNAL_ERROR", "The queue generation activity state is invalid.");
  }

  return {
    id: attempt.id,
    status: status.data,
    errorCategory: errorCategory.data,
    createdAt: attempt.createdAt,
    failedAt: attempt.failedAt,
  };
}

function toQueueItem(
  record: Awaited<ReturnType<typeof listProductionQueueRecords>>[number],
): ProductionQueueItemDto {
  const idea = toIdeaDto(record.idea);
  const status = decisionStateSchema.safeParse(idea.status);
  const language = generationLanguageSchema.safeParse(idea.language);

  if (!status.success || status.data !== "ACCEPTED" || !language.success) {
    throw new ApplicationError("INTERNAL_ERROR", "The Production Queue Idea state is invalid.");
  }

  if (record.idea.productionQueuePosition === null || record.idea.productionQueuePosition <= 0) {
    throw new ApplicationError("INTERNAL_ERROR", "The queued Idea position is invalid.");
  }

  return {
    id: idea.id,
    title: idea.title,
    description: idea.description,
    language: language.data,
    productionQueuePosition: record.idea.productionQueuePosition,
    lastAttempt: toAttemptDto(record.lastAttempt),
  };
}

export function createProductionQueueApplicationService(
  dependencies: ProductionQueueApplicationServiceDependencies = {},
): Readonly<{
  getProductionQueue(input: unknown): Promise<readonly ProductionQueueItemDto[]>;
  reorderProductionQueue(input: unknown): Promise<readonly ProductionQueueItemDto[]>;
}> {
  const database = dependencies.database ?? db;
  const getAuthenticatedUserId =
    dependencies.getAuthenticatedUserId ?? getServerAuthenticatedUserId;
  const serviceLogger = dependencies.logger ?? logger;

  return {
    async getProductionQueue(input: unknown): Promise<readonly ProductionQueueItemDto[]> {
      const userId = await getAuthenticatedUserId();

      if (!userId) {
        throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      }

      const parsed = z.object({ workspaceId: z.uuid() }).strict().safeParse(input);

      if (!parsed.success) {
        throw new ApplicationError("VALIDATION_ERROR", "The Production Queue request is invalid.");
      }

      await requireWorkspaceMembership(userId, parsed.data.workspaceId, database);
      const queue = (await listProductionQueueRecords(database, parsed.data.workspaceId)).map(
        toQueueItem,
      );

      serviceLogger.info("content.production_queue.loaded", {
        userId,
        workspaceId: parsed.data.workspaceId,
        module: "content",
        operation: "getProductionQueue",
      });

      return queue;
    },

    async reorderProductionQueue(input: unknown): Promise<readonly ProductionQueueItemDto[]> {
      const userId = await getAuthenticatedUserId();

      if (!userId) {
        throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      }

      const parsed = productionQueueReorderInputSchema.safeParse(input);

      if (!parsed.success) {
        throw new ApplicationError("VALIDATION_ERROR", "The Production Queue order is invalid.");
      }

      await requireWorkspaceOwner(userId, parsed.data.workspaceId, database);

      const queue = await database.transaction(async (transaction) => {
        await lockWorkspaceForUpdate(transaction, parsed.data.workspaceId);
        await requireWorkspaceOwner(userId, parsed.data.workspaceId, transaction);
        await lockWorkspaceIdeasForQueueMutation(transaction, parsed.data.workspaceId);
        const current = await listProductionQueueRecords(transaction, parsed.data.workspaceId);
        const currentIds = current.map((record) => record.idea.id);
        const submittedIds = parsed.data.orderedIdeaIds;
        const submittedSet = new Set(submittedIds);
        const exactMembership =
          submittedIds.length === currentIds.length &&
          submittedSet.size === currentIds.length &&
          currentIds.every((ideaId) => submittedSet.has(ideaId));

        if (!exactMembership) {
          throw notFoundOrConflict();
        }

        await rewriteProductionQueuePositionsInTransaction(transaction, submittedIds);

        return listProductionQueueRecords(transaction, parsed.data.workspaceId);
      });

      serviceLogger.info("content.production_queue.reordered", {
        userId,
        workspaceId: parsed.data.workspaceId,
        module: "content",
        operation: "reorderProductionQueue",
      });

      return queue.map(toQueueItem);
    },
  };
}
