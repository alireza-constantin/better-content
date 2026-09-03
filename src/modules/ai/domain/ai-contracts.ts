import "server-only";

import { z } from "zod";

const nonNegativeIntegerSchema = z
  .number()
  .finite()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

export const aiGenerationKindSchema = z.enum(["IDEA_GENERATION", "CONTENT_SCRIPT_GENERATION"]);
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

export const ideaGenerationSettingsSchema = z
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

/**
 * Shared audit metadata for the approved Phase 4 workflow. Provider-specific
 * request construction stays in infrastructure; this captures only the
 * provider-neutral operating policy retained by an AI Run.
 */
export const contentScriptGenerationSettingsSchema = z
  .object({
    structuredOutput: z
      .object({ schemaName: z.literal("content_script_v1"), schemaVersion: z.literal(1) })
      .strict(),
    reasoningEffort: z.literal("medium"),
    maxOutputTokens: z.literal(16_000),
    timeoutSeconds: z.literal(90),
    retryPolicy: z.object({ maxRetries: z.literal(0) }).strict(),
    serviceTier: z.literal("default"),
  })
  .strict();

export const generationSettingsSchema = z.union([
  ideaGenerationSettingsSchema,
  contentScriptGenerationSettingsSchema,
]);
export type GenerationSettings = z.infer<typeof generationSettingsSchema>;

/**
 * A provider-supplied correlation value that is safe to retain and log. The
 * value is opaque to the domain and never carries a provider envelope.
 */
export const safeProviderRequestCorrelationSchema = z.string().min(1);
export type SafeProviderRequestCorrelation = z.infer<typeof safeProviderRequestCorrelationSchema>;

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

export function parseSafeProviderRequestCorrelation(
  input: unknown,
): SafeProviderRequestCorrelation {
  return safeProviderRequestCorrelationSchema.parse(input);
}
