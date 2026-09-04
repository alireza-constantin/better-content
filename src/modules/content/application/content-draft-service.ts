import "server-only";

import { z } from "zod";

import { db } from "@/db";
import type { ContentDraft } from "@/db/schema";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import { requireWorkspaceOwner } from "@/modules/workspace/application";
import { contentScriptDocumentSchema, parseHumanContentScriptDraft } from "../domain";
import type { ContentDraftDto } from "./content-read-service";
import {
  findContentDraftWriteTarget,
  updateContentDraftIfRevisionMatches,
} from "./content-draft-repository";

const saveContentDraftInputShapeSchema = z
  .object({
    workspaceId: z.uuid(),
    contentId: z.uuid(),
    baseRevision: z.number().int().positive(),
    document: z.unknown(),
  })
  .strict();

type ContentDraftLogger = Pick<typeof logger, "info" | "warn">;

export type SaveContentDraftInput = Readonly<{
  workspaceId: string;
  contentId: string;
  baseRevision: number;
  document: unknown;
}>;

export type ContentDraftApplicationServiceDependencies = Readonly<{
  database?: typeof db;
  getAuthenticatedUserId?: () => Promise<string | null>;
  clock?: () => Date;
  logger?: ContentDraftLogger;
}>;

async function getServerAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession();

  return session?.user.id ?? null;
}

function parseSaveInput(input: unknown): SaveContentDraftInput {
  const result = saveContentDraftInputShapeSchema.safeParse(input);

  if (!result.success) {
    throw new ApplicationError("VALIDATION_ERROR", "The Content Draft save request is invalid.");
  }

  return result.data;
}

function parseHumanDraft(document: unknown) {
  try {
    // The canonicalizer is the only Draft document semantic boundary. The
    // schema above only validates the outer save input and required fields.
    return parseHumanContentScriptDraft(document);
  } catch {
    throw new ApplicationError("VALIDATION_ERROR", "The Content Draft document is invalid.");
  }
}

function toDraftDto(draft: ContentDraft): ContentDraftDto {
  const document = contentScriptDocumentSchema.safeParse(draft.document);

  if (!document.success || !Number.isInteger(draft.revision) || draft.revision <= 0) {
    throw new ApplicationError("INTERNAL_ERROR", "The Content Draft invariant is invalid.");
  }

  return {
    document: document.data,
    revision: draft.revision,
    updatedAt: draft.updatedAt,
  };
}

function logDraftOperation(
  serviceLogger: ContentDraftLogger,
  level: "info" | "warn",
  event: string,
  context: Readonly<{
    userId: string;
    workspaceId: string;
    contentId: string;
    revision?: number;
    errorCode?: ApplicationError["code"];
  }>,
): void {
  serviceLogger[level](event, {
    userId: context.userId,
    workspaceId: context.workspaceId,
    entityId: context.contentId,
    ...(context.revision === undefined ? {} : { revision: context.revision }),
    module: "content",
    operation: "saveContentDraft",
    ...(context.errorCode ? { errorCode: context.errorCode } : {}),
  });
}

export function createContentDraftApplicationService(
  dependencies: ContentDraftApplicationServiceDependencies = {},
): Readonly<{
  saveContentDraft(input: unknown): Promise<ContentDraftDto>;
}> {
  const database = dependencies.database ?? db;
  const getAuthenticatedUserId =
    dependencies.getAuthenticatedUserId ?? getServerAuthenticatedUserId;
  const clock = dependencies.clock ?? (() => new Date());
  const serviceLogger = dependencies.logger ?? logger;

  async function saveContentDraft(input: unknown): Promise<ContentDraftDto> {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
    }

    const parsedInput = parseSaveInput(input);

    try {
      // Authorize before document data can reach any authoritative read/write
      // result. Recheck inside the short transaction for current owner policy.
      await requireWorkspaceOwner(userId, parsedInput.workspaceId, database);
      const document = parseHumanDraft(parsedInput.document);
      const saved = await database.transaction(async (transaction) => {
        await requireWorkspaceOwner(userId, parsedInput.workspaceId, transaction);

        const updated = await updateContentDraftIfRevisionMatches(transaction, {
          workspaceId: parsedInput.workspaceId,
          contentId: parsedInput.contentId,
          baseRevision: parsedInput.baseRevision,
          document,
          updatedAt: clock(),
        });

        if (updated) {
          return toDraftDto(updated);
        }

        const target = await findContentDraftWriteTarget(
          transaction,
          parsedInput.workspaceId,
          parsedInput.contentId,
        );

        if (!target) {
          throw new ApplicationError("NOT_FOUND", "The requested Content was not found.");
        }

        throw new ApplicationError(
          "CONFLICT",
          "The Content Draft has changed since it was loaded.",
        );
      });

      logDraftOperation(serviceLogger, "info", "content.draft.saved", {
        userId,
        workspaceId: parsedInput.workspaceId,
        contentId: parsedInput.contentId,
        revision: saved.revision,
      });

      return saved;
    } catch (error) {
      const applicationError =
        error instanceof ApplicationError
          ? error
          : new ApplicationError("INTERNAL_ERROR", "The Content Draft could not be saved.");

      logDraftOperation(serviceLogger, "warn", "content.draft.save_failed", {
        userId,
        workspaceId: parsedInput.workspaceId,
        contentId: parsedInput.contentId,
        errorCode: applicationError.code,
      });

      throw applicationError;
    }
  }

  return { saveContentDraft };
}

const contentDraftApplicationService = createContentDraftApplicationService();

export const saveContentDraft = contentDraftApplicationService.saveContentDraft;
