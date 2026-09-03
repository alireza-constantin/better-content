import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import {
  aiGenerationKindSchema,
  failureCategorySchema,
  generationLifecycleSchema,
} from "@/modules/ai/domain/ai-contracts";
import { generationLanguageSchema } from "@/modules/ideas/domain/idea-generation-contracts";

export { failureCategorySchema, generationLanguageSchema, generationLifecycleSchema };
export type { FailureCategory, GenerationLifecycle } from "@/modules/ai/domain/ai-contracts";
export type { GenerationLanguage } from "@/modules/ideas/domain/idea-generation-contracts";

export const contentScriptGenerationKindSchema = aiGenerationKindSchema.extract([
  "CONTENT_SCRIPT_GENERATION",
]);
export type ContentScriptGenerationKind = z.infer<typeof contentScriptGenerationKindSchema>;

export const contentScriptFormatSchema = z.enum(["SHORT_VIDEO", "LONG_VIDEO"]);
export type ContentScriptFormat = z.infer<typeof contentScriptFormatSchema>;

// A Phase 4 Content Version can only be the immutable initial AI artifact.
// Later version sources belong to the phase that introduces those behaviors.
export const contentVersionSourceSchema = z.literal("AI_GENERATED");
export type ContentVersionSource = z.infer<typeof contentVersionSourceSchema>;

export const contentGenerationAttemptLifecycleSchema = generationLifecycleSchema;
export type ContentGenerationAttemptLifecycle = z.infer<
  typeof contentGenerationAttemptLifecycleSchema
>;

export const retryableContentGenerationAttemptLifecycleSchema = z.literal("FAILED");
export type RetryableContentGenerationAttemptLifecycle = z.infer<
  typeof retryableContentGenerationAttemptLifecycleSchema
>;

export const contentScriptGenerationFailureCategorySchema = failureCategorySchema;
export type ContentScriptGenerationFailureCategory = z.infer<
  typeof contentScriptGenerationFailureCategorySchema
>;

/** Source-specific, safe application guidance for a RATE_LIMITED result. */
export const contentGenerationRateLimitSourceSchema = z.enum(["WORKSPACE", "PROVIDER"]);
export type ContentGenerationRateLimitSource = z.infer<
  typeof contentGenerationRateLimitSourceSchema
>;

export const contentGenerationRateLimitedResultSchema = z
  .object({
    code: z.literal("RATE_LIMITED"),
    source: contentGenerationRateLimitSourceSchema,
  })
  .strict();
export type ContentGenerationRateLimitedResult = z.infer<
  typeof contentGenerationRateLimitedResultSchema
>;

const rawContentScriptDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    script: z.object({ text: z.string() }).strict(),
  })
  .strict();

/** The canonical schema-v1 JSONB shape, deliberately without Phase 5 fields. */
export const contentScriptDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    script: z.object({ text: z.string().max(50_000) }).strict(),
  })
  .strict();
export type ContentScriptDocument = z.infer<typeof contentScriptDocumentSchema>;

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

/**
 * Provider output is a canonical creator-work artifact: it removes accidental
 * outer whitespace and cannot be blank. Human Drafts intentionally do not.
 */
export function parseGeneratedContentScriptDocument(input: unknown): ContentScriptDocument {
  const document = rawContentScriptDocumentSchema.parse(input);

  return contentScriptDocumentSchema
    .extend({ script: z.object({ text: z.string().min(1).max(50_000) }).strict() })
    .parse({
      schemaVersion: 1,
      script: { text: normalizeLineEndings(document.script.text).trim() },
    });
}

/**
 * Draft editing only normalizes transport line endings. It preserves all other
 * creator-chosen whitespace and permits an intentionally empty Script.
 */
export function parseHumanContentScriptDraft(input: unknown): ContentScriptDocument {
  const document = rawContentScriptDocumentSchema.parse(input);

  return contentScriptDocumentSchema.parse({
    schemaVersion: 1,
    script: { text: normalizeLineEndings(document.script.text) },
  });
}

const rawContentScriptGenerationRequestSchema = z
  .object({
    workspaceId: z.string().uuid(),
    sourceIdeaId: z.string().uuid(),
    baseContentDnaVersionId: z.string().uuid(),
    requestedLanguage: generationLanguageSchema,
    format: contentScriptFormatSchema,
    instructions: z.string().optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

function normalizeInstructions(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized || undefined;
}

/**
 * This is the canonical client-to-domain request. Instructions normalize to
 * absence before fingerprinting, idempotency, authorization, or persistence.
 */
export const canonicalContentScriptGenerationRequestSchema =
  rawContentScriptGenerationRequestSchema.transform((request, context) => {
    const instructions = normalizeInstructions(request.instructions);

    if (instructions && instructions.length > 1_000) {
      context.addIssue({
        code: "too_big",
        maximum: 1_000,
        inclusive: true,
        origin: "string",
        path: ["instructions"],
        message: "Instructions must not exceed 1,000 characters.",
      });
      return z.NEVER;
    }

    return {
      workspaceId: request.workspaceId,
      sourceIdeaId: request.sourceIdeaId,
      baseContentDnaVersionId: request.baseContentDnaVersionId,
      requestedLanguage: request.requestedLanguage,
      format: request.format,
      ...(instructions ? { instructions } : {}),
      idempotencyKey: request.idempotencyKey,
    };
  });
export type CanonicalContentScriptGenerationRequest = z.output<
  typeof canonicalContentScriptGenerationRequestSchema
>;

export function parseCanonicalContentScriptGenerationRequest(
  input: unknown,
): CanonicalContentScriptGenerationRequest {
  return canonicalContentScriptGenerationRequestSchema.parse(input);
}

/**
 * Content identity/lineage is immutable after initial creation. This shared
 * value shape deliberately excludes lifecycle, acceptance, publishing, and
 * any future editor representation.
 */
export const contentImmutableLineageSchema = z
  .object({
    workspaceId: z.string().uuid(),
    sourceIdeaId: z.string().uuid(),
    contentLanguage: generationLanguageSchema,
    format: contentScriptFormatSchema,
    sourceGenerationAttemptId: z.string().uuid(),
  })
  .strict();
export type ContentImmutableLineage = z.infer<typeof contentImmutableLineageSchema>;

/**
 * Stable, length-prefixed serialization of the immutable request identity.
 * Workspace scopes idempotency storage but is not a business fingerprint fact.
 */
export function serializeContentScriptGenerationRequest(input: unknown): string {
  const request = parseCanonicalContentScriptGenerationRequest(input);
  const fields = [
    ["generationKind", "CONTENT_SCRIPT_GENERATION"],
    ["sourceIdeaId", request.sourceIdeaId],
    ["baseContentDnaVersionId", request.baseContentDnaVersionId],
    ["requestedLanguage", request.requestedLanguage],
    ["format", request.format],
    ["instructions", request.instructions ?? ""],
  ] as const;

  return fields.map(([name, value]) => `${name.length}:${name}:${value.length}:${value}`).join("|");
}

export function fingerprintContentScriptGenerationRequest(input: unknown): string {
  return createHash("sha256")
    .update(serializeContentScriptGenerationRequest(input), "utf8")
    .digest("hex");
}
