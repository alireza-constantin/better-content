import "server-only";

import { ApplicationError } from "@/lib/errors/app-error";
import { decisionStateSchema, type DecisionState } from "@/modules/ideas/domain";
import type { Idea } from "@/db/schema";

export type IdeaDto = Readonly<{
  id: string;
  batchId: string;
  position: number;
  title: string;
  description: string;
  category: string | null;
  language: "en" | "fa";
  status: DecisionState;
  rejectionReason: string | null;
  statusChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

export function toIdeaDto(idea: Idea): IdeaDto {
  const status = decisionStateSchema.safeParse(idea.status);

  if (!status.success) {
    throw new ApplicationError("INTERNAL_ERROR", "The idea decision state is invalid.");
  }

  if (idea.language !== "en" && idea.language !== "fa") {
    throw new ApplicationError("INTERNAL_ERROR", "The idea language invariant is invalid.");
  }

  return {
    id: idea.id,
    batchId: idea.batchId,
    position: idea.position,
    title: idea.title,
    description: idea.description,
    category: idea.category,
    language: idea.language,
    status: status.data,
    rejectionReason: idea.rejectionReason,
    statusChangedAt: idea.statusChangedAt,
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
  };
}
