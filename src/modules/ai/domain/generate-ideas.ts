import "server-only";

import { z } from "zod";

import {
  aiGenerationKindSchema,
  failureCategorySchema,
  providerNeutralUsageSchema,
  type AiGenerationKind,
  type FailureCategory,
  type ProviderNeutralUsage,
} from "@/modules/ai/domain/ai-contracts";
import {
  parseContentDnaPayload,
  type ContentDnaPayload,
} from "@/modules/dna/domain/content-dna-payload";
import {
  canonicalIdeaGenerationOutputSchema,
  generationLanguageSchema,
  parseCanonicalIdeaGenerationOutput,
  type CanonicalIdeaGenerationOutput,
  type GenerationLanguage,
} from "@/modules/ideas/domain/idea-generation-contracts";

export const ideaGenerationPromptVersionSchema = z.literal("idea-generation/v1");

export type IdeaGenerationPromptVersion = z.infer<typeof ideaGenerationPromptVersionSchema>;

/**
 * The AI port receives the canonical DNA snapshot, not a database row. The
 * request intentionally contains no workspace, user, session, credential, or
 * idempotency data; those concerns belong to the application service.
 */
const canonicalContentDnaPayloadSchema = z.unknown().transform((value, context) => {
  try {
    return parseContentDnaPayload(value);
  } catch {
    context.addIssue({ code: "custom", message: "Content DNA payload is invalid." });
    return z.NEVER;
  }
});

export const generateIdeasRequestSchema = z
  .object({
    generationKind: aiGenerationKindSchema,
    contentDna: canonicalContentDnaPayloadSchema,
    requestedLanguage: generationLanguageSchema,
    requestedCount: z.literal(20),
    promptVersion: ideaGenerationPromptVersionSchema,
  })
  .strict();

export type GenerateIdeasRequest = Readonly<{
  generationKind: AiGenerationKind;
  contentDna: ContentDnaPayload;
  requestedLanguage: GenerationLanguage;
  requestedCount: 20;
  promptVersion: IdeaGenerationPromptVersion;
}>;

export type GenerateIdeasRequestInput = z.input<typeof generateIdeasRequestSchema>;

export function parseGenerateIdeasRequest(input: unknown): GenerateIdeasRequest {
  return generateIdeasRequestSchema.parse(input);
}

/**
 * INTERRUPTED is intentionally excluded. It is an application lifecycle
 * outcome produced by stale recovery, not a provider execution result.
 */
export const generateIdeasFailureCategorySchema = failureCategorySchema.exclude(["INTERRUPTED"]);
export type GenerateIdeasFailureCategory = Exclude<FailureCategory, "INTERRUPTED">;

const canonicalGenerateIdeasSuccessResultSchema = z
  .object({
    ok: z.literal(true),
    output: canonicalIdeaGenerationOutputSchema,
    usage: providerNeutralUsageSchema.optional(),
  })
  .strict();

const unvalidatedGenerateIdeasSuccessResultSchema = z
  .object({
    ok: z.literal(true),
    output: z.unknown(),
    usage: providerNeutralUsageSchema.optional(),
  })
  .strict();

const generateIdeasFailureResultSchema = z
  .object({
    ok: z.literal(false),
    errorCategory: generateIdeasFailureCategorySchema,
  })
  .strict();

const unvalidatedGenerateIdeasResultSchema = z.discriminatedUnion("ok", [
  unvalidatedGenerateIdeasSuccessResultSchema,
  generateIdeasFailureResultSchema,
]);

/**
 * The exported schema is itself the canonicalizing result boundary. Calling
 * `.parse` on a successful provider-shaped result therefore cannot yield raw
 * whitespace, line endings, blank categories, or unvalidated idea data.
 */
export const generateIdeasResultSchema = unvalidatedGenerateIdeasResultSchema.transform(
  (result, context) => {
    if (!result.ok) {
      return result;
    }

    try {
      const output = parseCanonicalIdeaGenerationOutput(result.output);

      return canonicalGenerateIdeasSuccessResultSchema.parse({
        ok: true,
        output,
        ...(result.usage === undefined ? {} : { usage: result.usage }),
      });
    } catch {
      context.addIssue({ code: "custom", message: "The provider output is invalid." });
      return z.NEVER;
    }
  },
);

export type GenerateIdeasSuccess = z.infer<typeof canonicalGenerateIdeasSuccessResultSchema>;
export type GenerateIdeasFailure = z.infer<typeof generateIdeasFailureResultSchema>;
export type GenerateIdeasResult = z.output<typeof generateIdeasResultSchema>;

/**
 * Creates a safe failure result without accepting an Error, provider envelope,
 * or any other diagnostic payload at the neutral boundary.
 */
export function createGenerateIdeasFailure(
  errorCategory: GenerateIdeasFailureCategory,
): GenerateIdeasFailure {
  return generateIdeasFailureResultSchema.parse({ ok: false, errorCategory });
}

/**
 * Canonicalizes untrusted provider-shaped output before it can be represented
 * as a successful port result. Invalid output is reduced to the durable safe
 * category and never returned as a thrown provider error.
 */
export function createGenerateIdeasSuccess(output: unknown, usage?: unknown): GenerateIdeasResult {
  return parseGenerateIdeasResult({
    ok: true,
    output,
    ...(usage === undefined ? {} : { usage }),
  });
}

/**
 * Validates a provider implementation's result at the port boundary. Any
 * malformed result, including an invalid canonical snapshot or usage object,
 * becomes a safe INVALID_OUTPUT failure with no raw details.
 */
export function parseGenerateIdeasResult(input: unknown): GenerateIdeasResult {
  const result = generateIdeasResultSchema.safeParse(input);

  return result.success ? result.data : createGenerateIdeasFailure("INVALID_OUTPUT");
}

/**
 * The only Phase 3 AI port. Implementations may be OpenAI, a deterministic
 * test fake, or a future approved provider, but callers see this contract only.
 */
export interface GenerateIdeasProvider {
  generateIdeas(request: GenerateIdeasRequest): Promise<GenerateIdeasResult>;
}

// The shorter name is useful at application composition sites while retaining
// the explicit provider-port name for implementations.
export type GenerateIdeas = GenerateIdeasProvider;

export {
  canonicalIdeaGenerationOutputSchema,
  parseCanonicalIdeaGenerationOutput,
  providerNeutralUsageSchema,
};
export type { CanonicalIdeaGenerationOutput, ProviderNeutralUsage };
