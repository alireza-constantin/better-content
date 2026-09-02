import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import {
  aiGenerationKindSchema,
  failureCategorySchema,
  generationLifecycleSchema,
  generationSettingsSchema,
  providerNeutralUsageSchema,
} from "@/modules/ai/domain/ai-contracts";

export {
  aiGenerationKindSchema,
  failureCategorySchema,
  generationLifecycleSchema,
  generationSettingsSchema,
  providerNeutralUsageSchema,
};
export type {
  AiGenerationKind,
  FailureCategory,
  GenerationLifecycle,
  GenerationSettings,
  ProviderNeutralUsage,
} from "@/modules/ai/domain/ai-contracts";
export {
  canTransitionGenerationLifecycle,
  parseGenerationLifecycle,
  parseGenerationSettings,
  parseProviderNeutralUsage,
} from "@/modules/ai/domain/ai-contracts";

export const generationLanguageSchema = z.enum(["en", "fa"]);
export type GenerationLanguage = z.infer<typeof generationLanguageSchema>;

export const canonicalIdeaGenerationRequestSchema = z
  .object({
    generationKind: aiGenerationKindSchema,
    baseContentDnaVersionId: z.string().uuid(),
    requestedLanguage: generationLanguageSchema,
    requestedCount: z.literal(20),
  })
  .strict();
export type CanonicalIdeaGenerationRequest = z.infer<typeof canonicalIdeaGenerationRequestSchema>;

const rawIdeaSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    category: z.string().nullable().optional(),
  })
  .strict();

const rawCanonicalOutputSchema = z
  .object({ schemaVersion: z.literal(1), ideas: z.array(rawIdeaSchema) })
  .strict();

const singleLineStringSchema = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !/[\r\n]/.test(value), "Value must be a single line.");

const canonicalIdeaSchema = z
  .object({
    title: singleLineStringSchema(120),
    description: z.string().min(1).max(500),
    category: singleLineStringSchema(80).optional(),
  })
  .strict();

export const canonicalIdeaGenerationOutputSchema = z
  .object({ schemaVersion: z.literal(1), ideas: z.array(canonicalIdeaSchema).length(20) })
  .strict()
  .superRefine((output, context) => {
    const titles = new Set<string>();

    output.ideas.forEach((idea, index) => {
      const canonicalTitle = idea.title.toLowerCase();

      if (titles.has(canonicalTitle)) {
        context.addIssue({
          code: "custom",
          path: ["ideas", index, "title"],
          message: "Titles must be unique within a generation.",
        });
      }

      titles.add(canonicalTitle);
    });
  });
// This snapshot contains only immutable generated facts. IDs, positions,
// language, ownership, and mutable decision fields are assigned or enforced
// by later application/persistence boundaries.
export type CanonicalIdeaGenerationOutput = z.infer<typeof canonicalIdeaGenerationOutputSchema>;
export type CanonicalIdeaGenerationOutputInput = z.input<typeof rawCanonicalOutputSchema>;

export const decisionStateSchema = z.enum(["NEW", "SAVED", "ACCEPTED", "REJECTED"]);
export type DecisionState = z.infer<typeof decisionStateSchema>;

const rawRejectionReasonSchema = z.string().nullable().optional();
export const rejectionReasonSchema = z.string().min(1).max(500);

export function normalizeRejectionReason(input: unknown): string | undefined {
  const reason = rawRejectionReasonSchema.parse(input);
  const normalized = reason?.trim();

  if (!normalized) {
    return undefined;
  }

  return rejectionReasonSchema.parse(normalized);
}

function normalizeIdea(idea: CanonicalIdeaGenerationOutputInput["ideas"][number]) {
  const title = idea.title.trim();
  const description = idea.description.replace(/\r\n?/g, "\n").trim();
  const category = idea.category?.trim();

  return {
    title,
    description,
    ...(category ? { category } : {}),
  };
}

/**
 * Normalizes untrusted provider-shaped data and then validates the complete
 * canonical snapshot. The returned value contains generated facts only.
 */
export function parseCanonicalIdeaGenerationOutput(input: unknown): CanonicalIdeaGenerationOutput {
  const rawOutput = rawCanonicalOutputSchema.parse(input);
  const normalizedOutput = {
    schemaVersion: 1 as const,
    ideas: rawOutput.ideas.map(normalizeIdea),
  };

  return canonicalIdeaGenerationOutputSchema.parse(normalizedOutput);
}

export function parseGenerationLanguage(input: unknown): GenerationLanguage {
  return generationLanguageSchema.parse(input);
}

export function parseCanonicalIdeaGenerationRequest(
  input: unknown,
): CanonicalIdeaGenerationRequest {
  return canonicalIdeaGenerationRequestSchema.parse(input);
}

/**
 * Stable, explicit serialization of the immutable generation identity. The
 * length prefixes make field boundaries unambiguous and intentionally exclude
 * workspace, DNA body, UI locale, prompt, provider, model, and transient data.
 */
export function serializeIdeaGenerationRequest(input: unknown): string {
  const request = parseCanonicalIdeaGenerationRequest(input);
  const fields = [
    ["generationKind", request.generationKind],
    ["baseContentDnaVersionId", request.baseContentDnaVersionId],
    ["requestedLanguage", request.requestedLanguage],
    ["requestedCount", String(request.requestedCount)],
  ] as const;

  return fields.map(([name, value]) => `${name.length}:${name}:${value.length}:${value}`).join("|");
}

export function fingerprintIdeaGenerationRequest(input: unknown): string {
  return createHash("sha256").update(serializeIdeaGenerationRequest(input), "utf8").digest("hex");
}

export interface DecisionUpdateInput {
  currentState: DecisionState;
  nextState: DecisionState;
  rejectionReason?: string | null;
}

export interface DecisionUpdateResult {
  status: DecisionState;
  rejectionReason?: string;
  isNoop: boolean;
}

const decisionUpdateInputSchema = z
  .object({
    currentState: decisionStateSchema,
    nextState: decisionStateSchema,
    rejectionReason: rawRejectionReasonSchema,
  })
  .strict();

/**
 * Computes the direct decision update. A reason is meaningful only while the
 * resulting state is REJECTED; leaving that state always clears it.
 */
export function getDecisionUpdate(input: DecisionUpdateInput): DecisionUpdateResult {
  const update = decisionUpdateInputSchema.parse(input);
  const rejectionReason =
    update.nextState === "REJECTED" ? normalizeRejectionReason(update.rejectionReason) : undefined;

  return {
    status: update.nextState,
    ...(rejectionReason ? { rejectionReason } : {}),
    isNoop: update.currentState === update.nextState,
  };
}
