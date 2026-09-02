import "server-only";

import { db } from "@/db";
import { aiRuns, ideaGenerationBatches } from "@/db/schema";
import type { GenerateIdeasResult } from "@/modules/ai/domain/generate-ideas";
import type { ContentDnaPayload } from "@/modules/dna/domain/content-dna-payload";
import type { FailureCategory, GenerationLanguage } from "@/modules/ideas/domain";

export const IDEA_GENERATION_COUNT = 20 as const;

export type GenerationOperationInput = Readonly<{
  workspaceId: string;
  baseContentDnaVersionId: string;
  requestedLanguage: GenerationLanguage;
  idempotencyKey: string;
}>;

export type GenerationPair = Readonly<{
  batch: typeof ideaGenerationBatches.$inferSelect;
  run: typeof aiRuns.$inferSelect;
}>;

export type GenerationPreflightResult =
  | Readonly<{ kind: "replay"; pair: GenerationPair }>
  | Readonly<{ kind: "created"; pair: GenerationPair; contentDna: ContentDnaPayload }>
  | Readonly<{ kind: "rate-limited" }>;

export type GenerationInvocationResult =
  | Readonly<{ started: true; pair: GenerationPair }>
  | Readonly<{ started: false; pair: GenerationPair }>;

export type GenerationCompletionResult = Readonly<{
  completed: boolean;
  pair: GenerationPair;
}>;

export type GenerationWriter = Pick<typeof db, "select" | "insert" | "update" | "execute">;

export type SuccessfulGenerationResult = Extract<GenerateIdeasResult, { ok: true }>;

export type { ContentDnaPayload, FailureCategory, GenerationLanguage };
