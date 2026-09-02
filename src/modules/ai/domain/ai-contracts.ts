import "server-only";

import { z } from "zod";

const nonNegativeIntegerSchema = z
  .number()
  .finite()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

export const aiGenerationKindSchema = z.literal("IDEA_GENERATION");
export type AiGenerationKind = z.infer<typeof aiGenerationKindSchema>;

export const generationLifecycleSchema = z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]);
export type GenerationLifecycle = z.infer<typeof generationLifecycleSchema>;

export const failureCategorySchema = z.enum([
  "TIMEOUT",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "INVALID_OUTPUT",
  "INTERRUPTED",
  "UNKNOWN",
]);
export type FailureCategory = z.infer<typeof failureCategorySchema>;

export const providerNeutralUsageSchema = z
  .object({
    inputTokens: nonNegativeIntegerSchema.optional(),
    outputTokens: nonNegativeIntegerSchema.optional(),
    totalTokens: nonNegativeIntegerSchema.optional(),
    cachedInputTokens: nonNegativeIntegerSchema.optional(),
    cacheWriteTokens: nonNegativeIntegerSchema.optional(),
    reasoningTokens: nonNegativeIntegerSchema.optional(),
    computeUnits: nonNegativeIntegerSchema.optional(),
  })
  .strict();
export type ProviderNeutralUsage = z.infer<typeof providerNeutralUsageSchema>;

export const generationSettingsSchema = z
  .object({
    structuredOutput: z
      .object({ schemaName: z.literal("idea_generation_v1"), schemaVersion: z.literal(1) })
      .strict(),
    reasoningEffort: z.literal("medium"),
    maxOutputTokens: z.literal(16_000),
    timeoutSeconds: z.literal(60),
    retryPolicy: z.object({ maxRetries: z.literal(0) }).strict(),
    serviceTier: z.literal("default"),
  })
  .strict();
export type GenerationSettings = z.infer<typeof generationSettingsSchema>;

export function parseGenerationLifecycle(input: unknown): GenerationLifecycle {
  return generationLifecycleSchema.parse(input);
}

export function canTransitionGenerationLifecycle(
  from: GenerationLifecycle,
  to: GenerationLifecycle,
): boolean {
  if (from === to) {
    return true;
  }

  return (
    (from === "PENDING" && to === "RUNNING") ||
    (from === "RUNNING" && (to === "COMPLETED" || to === "FAILED"))
  );
}

export function parseProviderNeutralUsage(input: unknown): ProviderNeutralUsage {
  return providerNeutralUsageSchema.parse(input);
}

export function parseGenerationSettings(input: unknown): GenerationSettings {
  return generationSettingsSchema.parse(input);
}
