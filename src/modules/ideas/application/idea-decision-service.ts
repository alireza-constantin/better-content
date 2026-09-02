import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { ideas } from "@/db/schema";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import { decisionStateSchema, getDecisionUpdate } from "@/modules/ideas/domain";
import { requireWorkspaceOwner } from "@/modules/workspace/application";

import { findIdeaWithOwningBatchForUpdate } from "./idea-decision-repository";
import { toIdeaDto, type IdeaDto } from "./idea-dto";

const decisionInputSchema = z
  .object({
    workspaceId: z.uuid(),
    ideaId: z.uuid(),
    nextState: decisionStateSchema,
    rejectionReason: z.string().nullable().optional(),
  })
  .strict();

type IdeaDecisionLogger = Pick<typeof logger, "info" | "warn">;

export type IdeaDecisionApplicationServiceDependencies = Readonly<{
  database?: typeof db;
  getAuthenticatedUserId?: () => Promise<string | null>;
  clock?: () => Date;
  logger?: IdeaDecisionLogger;
}>;

export type IdeaDecisionDto = Readonly<IdeaDto & { isNoop: boolean }>;

async function getServerAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession();

  return session?.user.id ?? null;
}

function parseInput(input: unknown): z.infer<typeof decisionInputSchema> {
  const result = decisionInputSchema.safeParse(input);

  if (!result.success) {
    throw new ApplicationError("VALIDATION_ERROR", "The idea decision request is invalid.");
  }

  return result.data;
}

function notFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "The idea was not found.");
}

export function createIdeaDecisionApplicationService(
  dependencies: IdeaDecisionApplicationServiceDependencies = {},
): Readonly<{
  updateIdeaDecision(input: unknown): Promise<IdeaDecisionDto>;
  decideIdea(input: unknown): Promise<IdeaDecisionDto>;
}> {
  const database = dependencies.database ?? db;
  const getAuthenticatedUserId =
    dependencies.getAuthenticatedUserId ?? getServerAuthenticatedUserId;
  const clock = dependencies.clock ?? (() => new Date());
  const serviceLogger = dependencies.logger ?? logger;

  async function updateIdeaDecision(input: unknown): Promise<IdeaDecisionDto> {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
    }

    const parsedInput = parseInput(input);
    await requireWorkspaceOwner(userId, parsedInput.workspaceId, database);

    const result = await database.transaction(async (transaction) => {
      await requireWorkspaceOwner(userId, parsedInput.workspaceId, transaction);
      const current = await findIdeaWithOwningBatchForUpdate(
        transaction,
        parsedInput.workspaceId,
        parsedInput.ideaId,
      );

      if (!current) {
        throw notFound();
      }

      const currentState = decisionStateSchema.safeParse(current.idea.status);

      if (!currentState.success) {
        throw new ApplicationError("INTERNAL_ERROR", "The idea decision state is invalid.");
      }

      let update: ReturnType<typeof getDecisionUpdate>;

      try {
        update = getDecisionUpdate({
          currentState: currentState.data,
          nextState: parsedInput.nextState,
          rejectionReason: parsedInput.rejectionReason,
        });
      } catch {
        throw new ApplicationError("VALIDATION_ERROR", "The idea rejection reason is invalid.");
      }

      const nextRejectionReason = update.rejectionReason ?? null;
      const isNoop =
        update.status === currentState.data && current.idea.rejectionReason === nextRejectionReason;

      if (isNoop) {
        return { idea: current.idea, isNoop: true };
      }

      const now = clock();
      const [updatedIdea] = await transaction
        .update(ideas)
        .set({
          status: update.status,
          rejectionReason: nextRejectionReason,
          updatedAt: now,
          ...(update.status === currentState.data ? {} : { statusChangedAt: now }),
        })
        .where(eq(ideas.id, current.idea.id))
        .returning();

      if (!updatedIdea) {
        throw new ApplicationError("INTERNAL_ERROR", "The idea decision was not updated.");
      }

      return { idea: updatedIdea, isNoop: false };
    });

    const dto = { ...toIdeaDto(result.idea), isNoop: result.isNoop };
    serviceLogger.info("ideas.decision.updated", {
      userId,
      workspaceId: parsedInput.workspaceId,
      entityId: parsedInput.ideaId,
      module: "ideas",
      operation: "updateIdeaDecision",
      ...(dto.isNoop ? {} : { transition: `${result.idea.status}` }),
    });

    return dto;
  }

  return {
    updateIdeaDecision,
    decideIdea: updateIdeaDecision,
  };
}
