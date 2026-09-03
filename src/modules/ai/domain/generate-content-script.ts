import "server-only";

import { z } from "zod";

import {
  failureCategorySchema,
  providerNeutralUsageSchema,
  safeProviderRequestCorrelationSchema,
  type FailureCategory,
  type ProviderNeutralUsage,
  type SafeProviderRequestCorrelation,
} from "@/modules/ai/domain/ai-contracts";
import {
  contentScriptFormatSchema,
  contentScriptGenerationKindSchema,
  parseGeneratedContentScriptDocument,
  type ContentScriptDocument,
  type ContentScriptFormat,
  type ContentScriptGenerationKind,
} from "@/modules/content/domain/content-script-contracts";
import {
  parseContentDnaPayload,
  type ContentDnaPayload,
} from "@/modules/dna/domain/content-dna-payload";
import {
  generationLanguageSchema,
  parseCanonicalIdea,
  type CanonicalIdea,
  type GenerationLanguage,
} from "@/modules/ideas/domain/idea-generation-contracts";

const canonicalContentDnaPayloadSchema = z.unknown().transform((value, context) => {
  try {
    return parseContentDnaPayload(value);
  } catch {
    context.addIssue({ code: "custom", message: "Content DNA payload is invalid." });
    return z.NEVER;
  }
});

const canonicalSourceIdeaSchema = z.unknown().transform((value, context) => {
  try {
    return parseCanonicalIdea(value);
  } catch {
    context.addIssue({ code: "custom", message: "Source Idea is invalid." });
    return z.NEVER;
  }
});

const canonicalInstructionsSchema = z
  .string()
  .min(1)
  .max(1_000)
  .refine((value) => value.trim() === value, "Instructions must already be canonical.");

/**
 * Provider-neutral business facts for one Content Script generation. Provider
 * configuration and safety derivation are exclusively adapter concerns.
 */
export const generateContentScriptRequestSchema = z
  .object({
    generationKind: contentScriptGenerationKindSchema,
    sourceIdea: canonicalSourceIdeaSchema,
    contentDna: canonicalContentDnaPayloadSchema,
    requestedLanguage: generationLanguageSchema,
    format: contentScriptFormatSchema,
    instructions: canonicalInstructionsSchema.optional(),
  })
  .strict();

export type GenerateContentScriptRequest = Readonly<{
  generationKind: ContentScriptGenerationKind;
  sourceIdea: CanonicalIdea;
  contentDna: ContentDnaPayload;
  requestedLanguage: GenerationLanguage;
  format: ContentScriptFormat;
  instructions?: string;
}>;

export type GenerateContentScriptRequestInput = z.input<typeof generateContentScriptRequestSchema>;

export function parseGenerateContentScriptRequest(input: unknown): GenerateContentScriptRequest {
  return generateContentScriptRequestSchema.parse(input);
}

const canonicalGenerateContentScriptSuccessResultSchema = z
  .object({
    ok: z.literal(true),
    output: z.custom<ContentScriptDocument>(),
    usage: providerNeutralUsageSchema.optional(),
    providerRequestCorrelation: safeProviderRequestCorrelationSchema.optional(),
  })
  .strict();

const unvalidatedGenerateContentScriptSuccessResultSchema = z
  .object({
    ok: z.literal(true),
    output: z.unknown(),
    usage: providerNeutralUsageSchema.optional(),
    providerRequestCorrelation: safeProviderRequestCorrelationSchema.optional(),
  })
  .strict();

const generateContentScriptFailureResultSchema = z
  .object({
    ok: z.literal(false),
    errorCategory: failureCategorySchema,
  })
  .strict();

const unvalidatedGenerateContentScriptResultSchema = z.discriminatedUnion("ok", [
  unvalidatedGenerateContentScriptSuccessResultSchema,
  generateContentScriptFailureResultSchema,
]);

/** Provider output is untrusted until the generated Script contract accepts it. */
export const generateContentScriptResultSchema =
  unvalidatedGenerateContentScriptResultSchema.transform((result, context) => {
    if (!result.ok) {
      return result;
    }

    try {
      const output = parseGeneratedContentScriptDocument(result.output);

      return canonicalGenerateContentScriptSuccessResultSchema.parse({
        ok: true,
        output,
        ...(result.usage === undefined ? {} : { usage: result.usage }),
        ...(result.providerRequestCorrelation === undefined
          ? {}
          : { providerRequestCorrelation: result.providerRequestCorrelation }),
      });
    } catch {
      context.addIssue({ code: "custom", message: "The provider output is invalid." });
      return z.NEVER;
    }
  });

export type GenerateContentScriptSuccess = z.infer<
  typeof canonicalGenerateContentScriptSuccessResultSchema
>;
export type GenerateContentScriptFailure = z.infer<typeof generateContentScriptFailureResultSchema>;
export type GenerateContentScriptResult = z.output<typeof generateContentScriptResultSchema>;

export function createGenerateContentScriptFailure(
  errorCategory: FailureCategory,
): GenerateContentScriptFailure {
  return generateContentScriptFailureResultSchema.parse({ ok: false, errorCategory });
}

export function createGenerateContentScriptSuccess(
  output: unknown,
  usage?: unknown,
  providerRequestCorrelation?: unknown,
): GenerateContentScriptResult {
  return parseGenerateContentScriptResult({
    ok: true,
    output,
    ...(usage === undefined ? {} : { usage }),
    ...(providerRequestCorrelation === undefined ? {} : { providerRequestCorrelation }),
  });
}

/** Invalid provider-shaped results never expose raw output or diagnostics. */
export function parseGenerateContentScriptResult(input: unknown): GenerateContentScriptResult {
  const result = generateContentScriptResultSchema.safeParse(input);

  return result.success ? result.data : createGenerateContentScriptFailure("INVALID_OUTPUT");
}

/** The Content application's sole AI dependency for Script generation. */
export interface GenerateContentScriptProvider {
  generateContentScript(
    request: GenerateContentScriptRequest,
  ): Promise<GenerateContentScriptResult>;
}

export type GenerateContentScript = GenerateContentScriptProvider;

export { providerNeutralUsageSchema, safeProviderRequestCorrelationSchema };
export type { ContentScriptDocument, ProviderNeutralUsage, SafeProviderRequestCorrelation };
