import "server-only";

import { z } from "zod";

import { db } from "@/db";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import { decisionStateSchema, type DecisionState } from "@/modules/ideas/domain";
import { requireWorkspaceMembership } from "@/modules/workspace/application";

import { toIdeaDto, type IdeaDto } from "./idea-dto";
import { findOwnedIdeaGenerationBatchId, listIdeaLibraryRecords } from "./idea-library-repository";

export const ideaLibraryStatusFilterSchema = z.enum([
  "ALL",
  "NEW",
  "SAVED",
  "ACCEPTED",
  "REJECTED",
]);

export type IdeaLibraryStatusFilter = z.infer<typeof ideaLibraryStatusFilterSchema>;

const libraryInputSchema = z
  .object({
    workspaceId: z.uuid(),
    statusFilter: ideaLibraryStatusFilterSchema.default("NEW"),
    generationBatchId: z.string().nullable().optional(),
  })
  .strict();

export type IdeaLibraryItemDto = Readonly<
  IdeaDto & {
    contentCount: number;
    batch: Readonly<{
      id: string;
      contentDnaVersionNumber: number;
      requestedLanguage: "en" | "fa";
      status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
      createdAt: Date;
    }>;
  }
>;

export type IdeaLibraryDto = Readonly<{
  statusFilter: IdeaLibraryStatusFilter;
  generationBatchId: string | null;
  ideas: readonly IdeaLibraryItemDto[];
}>;

type IdeaLibraryLogger = Pick<typeof logger, "info">;

export type IdeaLibraryApplicationServiceDependencies = Readonly<{
  database?: typeof db;
  getAuthenticatedUserId?: () => Promise<string | null>;
  logger?: IdeaLibraryLogger;
}>;

async function getServerAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession();

  return session?.user.id ?? null;
}

function parseStoredStatus(value: string): DecisionState {
  const status = decisionStateSchema.safeParse(value);

  if (!status.success) {
    throw new ApplicationError("INTERNAL_ERROR", "The Idea decision state is invalid.");
  }

  return status.data;
}

function parseStoredLanguage(value: string): "en" | "fa" {
  if (value !== "en" && value !== "fa") {
    throw new ApplicationError("INTERNAL_ERROR", "The Idea generation language is invalid.");
  }

  return value;
}

function parseStoredBatchStatus(value: string): "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" {
  if (value !== "PENDING" && value !== "RUNNING" && value !== "COMPLETED" && value !== "FAILED") {
    throw new ApplicationError("INTERNAL_ERROR", "The Idea generation lifecycle state is invalid.");
  }

  return value;
}

function toLibraryItem(
  record: Awaited<ReturnType<typeof listIdeaLibraryRecords>>[number],
): IdeaLibraryItemDto {
  const idea = toIdeaDto(record.idea);

  return {
    ...idea,
    status: parseStoredStatus(idea.status),
    contentCount: record.contentCount,
    batch: {
      id: record.batch.id,
      contentDnaVersionNumber: record.contentDnaVersionNumber,
      requestedLanguage: parseStoredLanguage(record.batch.requestedLanguage),
      status: parseStoredBatchStatus(record.batch.status),
      createdAt: record.batch.createdAt,
    },
  };
}

/**
 * The Library deliberately follows Idea -> generation batch -> workspace. The
 * optional batch is normalized to All runs unless it belongs to this workspace,
 * so a foreign or malformed ID cannot disclose a generation run.
 */
export function createIdeaLibraryApplicationService(
  dependencies: IdeaLibraryApplicationServiceDependencies = {},
): Readonly<{
  getIdeaLibrary(input: unknown): Promise<IdeaLibraryDto>;
}> {
  const database = dependencies.database ?? db;
  const getAuthenticatedUserId =
    dependencies.getAuthenticatedUserId ?? getServerAuthenticatedUserId;
  const serviceLogger = dependencies.logger ?? logger;

  return {
    async getIdeaLibrary(input: unknown): Promise<IdeaLibraryDto> {
      const userId = await getAuthenticatedUserId();

      if (!userId) {
        throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      }

      const parsed = libraryInputSchema.safeParse(input);

      if (!parsed.success) {
        throw new ApplicationError("VALIDATION_ERROR", "The Idea Library request is invalid.");
      }

      await requireWorkspaceMembership(userId, parsed.data.workspaceId, database);

      const candidateBatchId = z.uuid().safeParse(parsed.data.generationBatchId);
      const generationBatchId = candidateBatchId.success
        ? await findOwnedIdeaGenerationBatchId(
            database,
            parsed.data.workspaceId,
            candidateBatchId.data,
          )
        : null;
      const records = await listIdeaLibraryRecords(database, {
        workspaceId: parsed.data.workspaceId,
        statusFilter: parsed.data.statusFilter,
        generationBatchId,
      });

      serviceLogger.info("ideas.library.loaded", {
        userId,
        workspaceId: parsed.data.workspaceId,
        module: "ideas",
        operation: "ideaLibrary",
        ...(generationBatchId ? { entityId: generationBatchId } : {}),
      });

      return {
        statusFilter: parsed.data.statusFilter,
        generationBatchId,
        ideas: records.map(toLibraryItem),
      };
    },
  };
}
