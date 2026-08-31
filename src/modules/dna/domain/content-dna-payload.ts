import { z } from "zod";

const contentLanguageSchema = z.enum(["en", "fa"]);

const rawContentDnaPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: z.object({ creatorOrBrandDescription: z.string().optional() }).strict().optional(),
    audience: z.object({ targetAudienceDescription: z.string().optional() }).strict().optional(),
    expertise: z
      .object({ primaryTopics: z.array(z.string()).optional() })
      .strict()
      .optional(),
    voice: z
      .object({
        toneTraits: z.array(z.string()).optional(),
        preferredStyle: z.string().optional(),
      })
      .strict()
      .optional(),
    goals: z
      .object({ contentGoals: z.array(z.string()).optional() })
      .strict()
      .optional(),
    preferences: z
      .object({
        preferredFormats: z.array(z.string()).optional(),
        topicsToAvoid: z.array(z.string()).optional(),
        approachesToAvoid: z.array(z.string()).optional(),
        additionalInstructions: z.string().optional(),
      })
      .strict()
      .optional(),
    language: z
      .object({
        defaultContentLanguage: z.string().optional(),
        contentLanguages: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const normalizedContentDnaPayloadStorageSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: z
      .object({ creatorOrBrandDescription: z.string().min(1).max(1_500) })
      .strict()
      .optional(),
    audience: z
      .object({ targetAudienceDescription: z.string().min(1).max(1_500) })
      .strict()
      .optional(),
    expertise: z
      .object({ primaryTopics: z.array(z.string().min(1).max(80)).min(1).max(10) })
      .strict()
      .optional(),
    voice: z
      .object({
        toneTraits: z.array(z.string().min(1).max(60)).min(1).max(5).optional(),
        preferredStyle: z.string().min(1).max(1_200).optional(),
      })
      .strict()
      .optional(),
    goals: z
      .object({ contentGoals: z.array(z.string().min(1).max(120)).min(1).max(5) })
      .strict()
      .optional(),
    preferences: z
      .object({
        preferredFormats: z.array(z.string().min(1).max(80)).min(1).max(8).optional(),
        topicsToAvoid: z.array(z.string().min(1).max(120)).min(1).max(10).optional(),
        approachesToAvoid: z.array(z.string().min(1).max(160)).min(1).max(10).optional(),
        additionalInstructions: z.string().min(1).max(2_000).optional(),
      })
      .strict()
      .optional(),
    language: z
      .object({
        defaultContentLanguage: contentLanguageSchema.optional(),
        contentLanguages: z.array(contentLanguageSchema).min(1).max(2).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((payload, context) => {
    const defaultContentLanguage = payload.language?.defaultContentLanguage;
    const contentLanguages = payload.language?.contentLanguages;

    if (defaultContentLanguage && !contentLanguages?.includes(defaultContentLanguage)) {
      context.addIssue({
        code: "custom",
        path: ["language", "contentLanguages"],
        message: "contentLanguages must include defaultContentLanguage.",
      });
    }

    if (contentLanguages && new Set(contentLanguages).size !== contentLanguages.length) {
      context.addIssue({
        code: "custom",
        path: ["language", "contentLanguages"],
        message: "contentLanguages must not contain duplicates.",
      });
    }
  });

export type ContentDnaPayload = z.output<typeof normalizedContentDnaPayloadStorageSchema>;

export type ContentDnaReadiness = "INCOMPLETE" | "AI_READY";

function normalizeText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.replace(/\r\n?/g, "\n").trim();

  return normalized || undefined;
}

function rejectBlankListEntry(): never {
  throw new z.ZodError([
    {
      code: "custom",
      message: "Content DNA list entries must not be blank.",
      path: [],
    },
  ]);
}

function normalizeList(values: readonly string[] | undefined): string[] | undefined {
  if (values === undefined || values.length === 0) {
    return undefined;
  }

  const seen = new Set<string>();
  const normalizedValues: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);

    if (!normalized) {
      rejectBlankListEntry();
    }

    const deduplicationKey = normalized.toLowerCase();

    if (!seen.has(deduplicationKey)) {
      seen.add(deduplicationKey);
      normalizedValues.push(normalized);
    }
  }

  return normalizedValues.length > 0 ? normalizedValues : undefined;
}

/**
 * The only V1 Content DNA payload boundary. It rejects unknown keys, produces
 * canonical absence, and validates the normalized snapshot before persistence
 * or equality comparison.
 */
export function parseContentDnaPayload(input: unknown): ContentDnaPayload {
  const payload = rawContentDnaPayloadSchema.parse(input);
  const creatorOrBrandDescription = normalizeText(payload.identity?.creatorOrBrandDescription);
  const targetAudienceDescription = normalizeText(payload.audience?.targetAudienceDescription);
  const primaryTopics = normalizeList(payload.expertise?.primaryTopics);
  const toneTraits = normalizeList(payload.voice?.toneTraits);
  const preferredStyle = normalizeText(payload.voice?.preferredStyle);
  const contentGoals = normalizeList(payload.goals?.contentGoals);
  const preferredFormats = normalizeList(payload.preferences?.preferredFormats);
  const topicsToAvoid = normalizeList(payload.preferences?.topicsToAvoid);
  const approachesToAvoid = normalizeList(payload.preferences?.approachesToAvoid);
  const additionalInstructions = normalizeText(payload.preferences?.additionalInstructions);
  const defaultContentLanguage = normalizeText(payload.language?.defaultContentLanguage);
  const contentLanguages = normalizeList(payload.language?.contentLanguages);

  return normalizedContentDnaPayloadStorageSchema.parse({
    schemaVersion: 1,
    ...(creatorOrBrandDescription ? { identity: { creatorOrBrandDescription } } : {}),
    ...(targetAudienceDescription ? { audience: { targetAudienceDescription } } : {}),
    ...(primaryTopics ? { expertise: { primaryTopics } } : {}),
    ...(toneTraits || preferredStyle
      ? {
          voice: {
            ...(toneTraits ? { toneTraits } : {}),
            ...(preferredStyle ? { preferredStyle } : {}),
          },
        }
      : {}),
    ...(contentGoals ? { goals: { contentGoals } } : {}),
    ...(preferredFormats || topicsToAvoid || approachesToAvoid || additionalInstructions
      ? {
          preferences: {
            ...(preferredFormats ? { preferredFormats } : {}),
            ...(topicsToAvoid ? { topicsToAvoid } : {}),
            ...(approachesToAvoid ? { approachesToAvoid } : {}),
            ...(additionalInstructions ? { additionalInstructions } : {}),
          },
        }
      : {}),
    ...(defaultContentLanguage || contentLanguages
      ? {
          language: {
            ...(defaultContentLanguage ? { defaultContentLanguage } : {}),
            ...(contentLanguages ? { contentLanguages } : {}),
          },
        }
      : {}),
  });
}

/**
 * Canonically derives whether a storage-valid snapshot has the minimum
 * information that future AI generation may consume. This is not persisted.
 */
export function getContentDnaReadiness(payload: ContentDnaPayload): ContentDnaReadiness {
  const { identity, audience, expertise, voice, goals, language } = payload;

  const isReady = Boolean(
    identity?.creatorOrBrandDescription &&
    audience?.targetAudienceDescription &&
    expertise?.primaryTopics?.length &&
    voice?.toneTraits?.length &&
    goals?.contentGoals?.length &&
    language?.defaultContentLanguage &&
    language.contentLanguages?.length &&
    language.contentLanguages.includes(language.defaultContentLanguage),
  );

  return isReady ? "AI_READY" : "INCOMPLETE";
}
