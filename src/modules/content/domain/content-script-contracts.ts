import { createHash, randomUUID } from "node:crypto";

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
export const contentVersionSourceSchema = z.enum([
  "AI_GENERATED",
  "LEGACY_DRAFT_CHECKPOINT",
  "CREATOR_ACCEPTED",
]);
export type ContentVersionSource = z.infer<typeof contentVersionSourceSchema>;
/** Only an immutable creator-acceptance snapshot may be the current pointer. */
export const acceptedContentVersionSourceSchema = z.literal("CREATOR_ACCEPTED");

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
export type ContentDocumentV1 = ContentScriptDocument;

const directionIdSchema = z.uuid();
export const productionDirectionLimits = {
  perBlockCategory: 12,
  perDocument: 300,
  nuance: 280,
  note: 500,
  overlay: 280,
  soundCue: 280,
  searchQuery: 200,
} as const;
export const performanceDirectionTypes = [
  "PAUSE",
  "EMPHASIS",
  "DELIVERY",
  "GESTURE",
  "POSITION",
  "GAZE",
  "PERFORMANCE_NOTE",
] as const;
export const editDirectionTypes = [
  "TEXT_OVERLAY",
  "ZOOM",
  "CUT",
  "BROLL_CUE",
  "SOUND_CUE",
  "CAPTION_EMPHASIS",
  "EDIT_NOTE",
] as const;
export const productionDirectionValues = {
  duration: ["short", "medium", "long"],
  strength: ["subtle", "clear", "strong"],
  tone: ["calm", "warm", "serious", "energetic", "playful"],
  pace: ["slower", "faster"],
  gesture: ["hand", "point", "show_object"],
  position: ["sit", "stand", "walk"],
  gaze: ["camera", "away"],
  placement: ["top", "center", "bottom"],
  zoomMode: ["in", "out"],
  zoomIntensity: ["subtle", "normal", "strong"],
  cut: ["hard", "jump"],
  soundKind: ["music", "sound_effect"],
  caption: ["highlight", "animate"],
} as const;
const nuanceSchema = z.string().max(productionDirectionLimits.nuance).optional();

const performanceDirectionSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: directionIdSchema,
      type: z.literal("PAUSE"),
      duration: z.enum(productionDirectionValues.duration),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("EMPHASIS"),
      strength: z.enum(productionDirectionValues.strength),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("DELIVERY"),
      tone: z.enum(productionDirectionValues.tone).optional(),
      pace: z.enum(productionDirectionValues.pace).optional(),
      nuance: nuanceSchema,
    })
    .strict()
    .refine((value) => value.tone !== undefined || value.pace !== undefined),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("GESTURE"),
      kind: z.enum(productionDirectionValues.gesture),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("POSITION"),
      action: z.enum(productionDirectionValues.position),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("GAZE"),
      target: z.enum(productionDirectionValues.gaze),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("PERFORMANCE_NOTE"),
      text: z.string().max(productionDirectionLimits.note),
    })
    .strict(),
]);
export type PerformanceDirection = z.infer<typeof performanceDirectionSchema>;

const editDirectionSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: directionIdSchema,
      type: z.literal("TEXT_OVERLAY"),
      text: z.string().max(productionDirectionLimits.overlay),
      placement: z.enum(productionDirectionValues.placement),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("ZOOM"),
      mode: z.enum(productionDirectionValues.zoomMode),
      intensity: z.enum(productionDirectionValues.zoomIntensity),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("CUT"),
      style: z.enum(productionDirectionValues.cut),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("BROLL_CUE"),
      description: z.string().max(productionDirectionLimits.note),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("SOUND_CUE"),
      kind: z.enum(productionDirectionValues.soundKind),
      description: z.string().max(productionDirectionLimits.soundCue),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("CAPTION_EMPHASIS"),
      style: z.enum(productionDirectionValues.caption),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("EDIT_NOTE"),
      text: z.string().max(productionDirectionLimits.note),
    })
    .strict(),
]);
export type EditDirection = z.infer<typeof editDirectionSchema>;

export const contentDocumentV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    script: z
      .object({
        blocks: z
          .array(
            z
              .object({
                id: z.uuid(),
                type: z.literal("paragraph"),
                text: z.string().refine((value) => !/[\r\n]/.test(value)),
                performanceDirections: z
                  .array(performanceDirectionSchema)
                  .max(productionDirectionLimits.perBlockCategory),
                editDirections: z
                  .array(editDirectionSchema)
                  .max(productionDirectionLimits.perBlockCategory),
              })
              .strict(),
          )
          .min(1)
          .max(1000),
      })
      .strict(),
  })
  .strict()
  .superRefine((document, context) => {
    const blockIds = new Set<string>();
    const directionIds = new Set<string>();
    let characterCount = 0;
    let directionCount = 0;
    for (const [index, block] of document.script.blocks.entries()) {
      characterCount += block.text.length;
      if (blockIds.has(block.id))
        context.addIssue({
          code: "custom",
          path: ["script", "blocks", index, "id"],
          message: "Block IDs must be unique.",
        });
      blockIds.add(block.id);
      for (const [category, directions] of [
        ["performanceDirections", block.performanceDirections],
        ["editDirections", block.editDirections],
      ] as const)
        for (const [directionIndex, direction] of directions.entries()) {
          directionCount += 1;
          if (directionIds.has(direction.id))
            context.addIssue({
              code: "custom",
              path: ["script", "blocks", index, category, directionIndex, "id"],
              message: "Direction IDs must be document-wide unique.",
            });
          directionIds.add(direction.id);
        }
    }
    if (characterCount > 50_000)
      context.addIssue({
        code: "too_big",
        maximum: 50_000,
        inclusive: true,
        origin: "string",
        path: ["script", "blocks"],
        message: "Script must not exceed 50,000 characters.",
      });
    if (directionCount > productionDirectionLimits.perDocument)
      context.addIssue({
        code: "too_big",
        maximum: productionDirectionLimits.perDocument,
        inclusive: true,
        origin: "array",
        path: ["script", "blocks"],
        message: "Document must not exceed 300 Production Directions.",
      });
  });
export type ContentDocumentV2 = z.infer<typeof contentDocumentV2Schema>;

const assetIdSchema = z.uuid().optional();
const searchQuerySchema = z
  .string()
  .refine((value) => Array.from(value).length <= productionDirectionLimits.searchQuery)
  .refine((value) => value.trim() === value && value.length > 0 && !/[\r\n]/u.test(value));
const editDirectionV3Schema = z.discriminatedUnion("type", [
  z
    .object({
      id: directionIdSchema,
      type: z.literal("TEXT_OVERLAY"),
      text: z.string().max(productionDirectionLimits.overlay),
      placement: z.enum(productionDirectionValues.placement),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("ZOOM"),
      mode: z.enum(productionDirectionValues.zoomMode),
      intensity: z.enum(productionDirectionValues.zoomIntensity),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("CUT"),
      style: z.enum(productionDirectionValues.cut),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("BROLL_CUE"),
      description: z.string().max(productionDirectionLimits.note),
      nuance: nuanceSchema,
      assetId: assetIdSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("SOUND_CUE"),
      kind: z.enum(productionDirectionValues.soundKind),
      description: z.string().max(productionDirectionLimits.soundCue),
      nuance: nuanceSchema,
      assetId: assetIdSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("CAPTION_EMPHASIS"),
      style: z.enum(productionDirectionValues.caption),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("EDIT_NOTE"),
      text: z.string().max(productionDirectionLimits.note),
    })
    .strict(),
]);

/** V3 is intentionally V2-shaped; Asset identity is allowed only on its two approved edit cues. */
export const contentDocumentV3Schema = z
  .object({
    schemaVersion: z.literal(3),
    script: z
      .object({
        blocks: z
          .array(
            z
              .object({
                id: z.uuid(),
                type: z.literal("paragraph"),
                text: z.string().refine((value) => !/[\r\n]/.test(value)),
                performanceDirections: z
                  .array(performanceDirectionSchema)
                  .max(productionDirectionLimits.perBlockCategory),
                editDirections: z
                  .array(editDirectionV3Schema)
                  .max(productionDirectionLimits.perBlockCategory),
              })
              .strict(),
          )
          .min(1)
          .max(1000),
      })
      .strict(),
  })
  .strict()
  .superRefine((document, context) => {
    const v2Shape = {
      schemaVersion: 2,
      script: {
        blocks: document.script.blocks.map((block) => ({
          ...block,
          editDirections: block.editDirections.map((direction) => {
            const withoutAsset = { ...direction } as typeof direction & { assetId?: string };
            delete withoutAsset.assetId;
            return withoutAsset;
          }),
        })),
      },
    };
    const result = contentDocumentV2Schema.safeParse(v2Shape);
    if (!result.success)
      for (const issue of result.error.issues) context.addIssue({ ...issue, path: issue.path });
  });
export type ContentDocumentV3 = z.infer<typeof contentDocumentV3Schema>;

const editDirectionV4Schema = z.discriminatedUnion("type", [
  z
    .object({
      id: directionIdSchema,
      type: z.literal("TEXT_OVERLAY"),
      text: z.string().max(productionDirectionLimits.overlay),
      placement: z.enum(productionDirectionValues.placement),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("ZOOM"),
      mode: z.enum(productionDirectionValues.zoomMode),
      intensity: z.enum(productionDirectionValues.zoomIntensity),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("CUT"),
      style: z.enum(productionDirectionValues.cut),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("BROLL_CUE"),
      description: z.string().max(productionDirectionLimits.note),
      searchQuery: searchQuerySchema.optional(),
      nuance: nuanceSchema,
      assetId: assetIdSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("SOUND_CUE"),
      kind: z.enum(productionDirectionValues.soundKind),
      description: z.string().max(productionDirectionLimits.soundCue),
      nuance: nuanceSchema,
      assetId: assetIdSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("CAPTION_EMPHASIS"),
      style: z.enum(productionDirectionValues.caption),
      nuance: nuanceSchema,
    })
    .strict(),
  z
    .object({
      id: directionIdSchema,
      type: z.literal("EDIT_NOTE"),
      text: z.string().max(productionDirectionLimits.note),
    })
    .strict(),
]);

/** V4 adds only creator-editable B-roll search text; asset identity remains unchanged. */
export const contentDocumentV4Schema = z
  .object({
    schemaVersion: z.literal(4),
    script: z
      .object({
        blocks: z
          .array(
            z
              .object({
                id: z.uuid(),
                type: z.literal("paragraph"),
                text: z.string().refine((value) => !/[\r\n]/.test(value)),
                performanceDirections: z
                  .array(performanceDirectionSchema)
                  .max(productionDirectionLimits.perBlockCategory),
                editDirections: z
                  .array(editDirectionV4Schema)
                  .max(productionDirectionLimits.perBlockCategory),
              })
              .strict(),
          )
          .min(1)
          .max(1000),
      })
      .strict(),
  })
  .strict()
  .superRefine((document, context) => {
    const v3Shape = {
      ...document,
      schemaVersion: 3,
      script: {
        blocks: document.script.blocks.map((block) => ({
          ...block,
          editDirections: block.editDirections.map((direction) => {
            const next = { ...direction } as typeof direction & { searchQuery?: string };
            delete next.searchQuery;
            return next;
          }),
        })),
      },
    };
    const result = contentDocumentV3Schema.safeParse(v3Shape);
    if (!result.success)
      for (const issue of result.error.issues) context.addIssue({ ...issue, path: issue.path });
  });
export type ContentDocumentV4 = z.infer<typeof contentDocumentV4Schema>;

export const contentDocumentSchema = z.union([
  contentScriptDocumentSchema,
  contentDocumentV2Schema,
  contentDocumentV3Schema,
  contentDocumentV4Schema,
]);
export type ContentDocument = z.infer<typeof contentDocumentSchema>;

export type TeleprompterPerformanceHintDto = Readonly<{
  id: string;
  type: (typeof performanceDirectionTypes)[number];
  values: readonly string[];
  text?: string;
  nuance?: string;
}>;

export type TeleprompterScriptBlockDto = Readonly<{
  id: string;
  text: string;
  performanceHints: readonly TeleprompterPerformanceHintDto[];
}>;

/**
 * Read-only presentation projection for the immersive prompting surface.
 * V1 intentionally keeps a legacy V1 Script as one block; unlike the editor
 * projection this function does not materialize or persist a migrated shape.
 */
export function projectContentDocumentToTeleprompter(
  input: ContentDocument,
): readonly TeleprompterScriptBlockDto[] {
  if (input.schemaVersion === 1) {
    return [
      {
        id: "legacy-script",
        text: input.script.text,
        performanceHints: [],
      },
    ];
  }

  return input.script.blocks.map((block) => ({
    id: block.id,
    text: block.text,
    performanceHints: block.performanceDirections.map((direction) => {
      switch (direction.type) {
        case "PAUSE":
          return {
            id: direction.id,
            type: direction.type,
            values: [direction.duration],
            ...(direction.nuance === undefined ? {} : { nuance: direction.nuance }),
          };
        case "EMPHASIS":
          return {
            id: direction.id,
            type: direction.type,
            values: [direction.strength],
            ...(direction.nuance === undefined ? {} : { nuance: direction.nuance }),
          };
        case "DELIVERY":
          return {
            id: direction.id,
            type: direction.type,
            values: [direction.tone, direction.pace].filter(
              (value): value is Exclude<typeof value, undefined> => value !== undefined,
            ),
            ...(direction.nuance === undefined ? {} : { nuance: direction.nuance }),
          };
        case "GESTURE":
          return {
            id: direction.id,
            type: direction.type,
            values: [direction.kind],
            ...(direction.nuance === undefined ? {} : { nuance: direction.nuance }),
          };
        case "POSITION":
          return {
            id: direction.id,
            type: direction.type,
            values: [direction.action],
            ...(direction.nuance === undefined ? {} : { nuance: direction.nuance }),
          };
        case "GAZE":
          return {
            id: direction.id,
            type: direction.type,
            values: [direction.target],
            ...(direction.nuance === undefined ? {} : { nuance: direction.nuance }),
          };
        case "PERFORMANCE_NOTE":
          return {
            id: direction.id,
            type: direction.type,
            values: [],
            text: direction.text,
          };
      }
    }),
  }));
}

export type EditGuideEditDirection =
  | ContentDocumentV2["script"]["blocks"][number]["editDirections"][number]
  | ContentDocumentV3["script"]["blocks"][number]["editDirections"][number]
  | ContentDocumentV4["script"]["blocks"][number]["editDirections"][number];

export type EditGuideScriptBlockDto = Readonly<{
  id: string;
  text: string;
  editDirections: readonly EditGuideEditDirection[];
}>;

/**
 * Read-only production projection for the Edit Guide. V1 stays one exact
 * Script block and has no directions; newer documents retain block and
 * direction order without materializing or persisting a migrated shape.
 */
export function projectContentDocumentToEditGuide(
  input: ContentDocument,
): readonly EditGuideScriptBlockDto[] {
  if (input.schemaVersion === 1) {
    return [{ id: "legacy-script", text: input.script.text, editDirections: [] }];
  }

  return input.script.blocks.map((block) => ({
    id: block.id,
    text: block.text,
    editDirections: block.editDirections,
  }));
}

export const contentAcceptanceStateSchema = z.enum([
  "NOT_ACCEPTED",
  "ACCEPTED",
  "UNACCEPTED_CHANGES",
]);
export type ContentAcceptanceState = z.infer<typeof contentAcceptanceStateSchema>;

export function canonicalizeContentDocumentV2(input: unknown): ContentDocumentV2 {
  const document = contentDocumentV2Schema.parse(input);
  const blocks = document.script.blocks.filter(
    (block) =>
      block.text.trim().length > 0 ||
      block.performanceDirections.length > 0 ||
      block.editDirections.length > 0,
  );
  return contentDocumentV2Schema.parse({
    schemaVersion: 2,
    script: {
      blocks:
        blocks.length > 0
          ? blocks
          : [
              {
                id: document.script.blocks[0].id,
                type: "paragraph",
                text: "",
                performanceDirections: [],
                editDirections: [],
              },
            ],
    },
  });
}

export function canonicalizeContentDocumentV3(input: unknown): ContentDocumentV3 {
  const document = contentDocumentV3Schema.parse(input);
  const blocks = document.script.blocks.filter(
    (block) =>
      block.text.trim().length > 0 ||
      block.performanceDirections.length > 0 ||
      block.editDirections.length > 0,
  );
  return contentDocumentV3Schema.parse({
    ...document,
    script: {
      blocks:
        blocks.length > 0
          ? blocks
          : [
              {
                id: document.script.blocks[0].id,
                type: "paragraph",
                text: "",
                performanceDirections: [],
                editDirections: [],
              },
            ],
    },
  });
}

export function canonicalizeContentDocumentV4(input: unknown): ContentDocumentV4 {
  const normalized =
    typeof input === "object" && input !== null
      ? {
          ...(input as Record<string, unknown>),
          script: {
            ...((input as { script?: Record<string, unknown> }).script ?? {}),
            blocks: Array.isArray((input as { script?: { blocks?: unknown[] } }).script?.blocks)
              ? (input as { script: { blocks: unknown[] } }).script.blocks.map((block) => {
                  if (typeof block !== "object" || block === null) return block;
                  const record = block as Record<string, unknown>;
                  return {
                    ...record,
                    editDirections: Array.isArray(record.editDirections)
                      ? record.editDirections.map((direction) => {
                          if (typeof direction !== "object" || direction === null) return direction;
                          const next = { ...(direction as Record<string, unknown>) };
                          if (next.type === "BROLL_CUE" && typeof next.searchQuery === "string") {
                            const searchQuery = next.searchQuery.trim();
                            if (searchQuery) next.searchQuery = searchQuery;
                            else delete next.searchQuery;
                          }
                          return next;
                        })
                      : record.editDirections,
                  };
                })
              : undefined,
          },
        }
      : input;
  const document = contentDocumentV4Schema.parse(normalized);
  const blocks = document.script.blocks.filter(
    (block) =>
      block.text.trim().length > 0 ||
      block.performanceDirections.length > 0 ||
      block.editDirections.length > 0,
  );
  return contentDocumentV4Schema.parse({
    ...document,
    script: {
      blocks:
        blocks.length > 0
          ? blocks
          : [
              {
                id: document.script.blocks[0].id,
                type: "paragraph",
                text: "",
                performanceDirections: [],
                editDirections: [],
              },
            ],
    },
  });
}

/** Pure, deterministic, lossless V2 view upgrade. It intentionally performs no persistence. */
export function projectContentDocumentV2ToV3(input: ContentDocumentV2): ContentDocumentV3 {
  const document = canonicalizeContentDocumentV2(input);
  return contentDocumentV3Schema.parse({ ...document, schemaVersion: 3 });
}

/**
 * Compatibility projection for the pre-Asset editor. It is never an
 * authority and deliberately removes only the V3 Asset identity field.
 * Callers that persist the result must pass through the V3 migration boundary.
 */
export function projectContentDocumentV3ToV2(input: ContentDocumentV3): ContentDocumentV2 {
  const document = canonicalizeContentDocumentV3(input);
  return contentDocumentV2Schema.parse({
    schemaVersion: 2,
    script: {
      blocks: document.script.blocks.map((block) => ({
        ...block,
        editDirections: block.editDirections.map((direction) => {
          const withoutAsset = { ...direction } as typeof direction & { assetId?: string };
          delete withoutAsset.assetId;
          return withoutAsset;
        }),
      })),
    },
  });
}

/** Pure, lossless V3 compatibility projection. It never writes a Draft or Version. */
export function projectContentDocumentV3ToV4(input: ContentDocumentV3): ContentDocumentV4 {
  const document = canonicalizeContentDocumentV3(input);
  return contentDocumentV4Schema.parse({ ...document, schemaVersion: 4 });
}
export function projectContentDocumentV4ToV3(input: ContentDocumentV4): ContentDocumentV3 {
  const document = canonicalizeContentDocumentV4(input);
  return contentDocumentV3Schema.parse({
    ...document,
    schemaVersion: 3,
    script: {
      blocks: document.script.blocks.map((block) => ({
        ...block,
        editDirections: block.editDirections.map((direction) => {
          const next = { ...direction } as typeof direction & { searchQuery?: string };
          delete next.searchQuery;
          return next;
        }),
      })),
    },
  });
}

/** Pure editor projection for every persisted document version. */
export function projectContentDocumentToV4(input: ContentDocument): ContentDocumentV4 {
  if (input.schemaVersion === 1)
    return projectContentDocumentV3ToV4(
      projectContentDocumentV2ToV3(materializeContentDocumentV2(input)),
    );
  if (input.schemaVersion === 2)
    return projectContentDocumentV3ToV4(projectContentDocumentV2ToV3(input));
  if (input.schemaVersion === 3) return projectContentDocumentV3ToV4(input);
  return canonicalizeContentDocumentV4(input);
}
export const projectContentDocumentToV3 = projectContentDocumentToV4;

export function parseContentDocument(input: unknown): ContentDocument {
  const parsed = contentDocumentSchema.parse(input);
  return parsed.schemaVersion === 2
    ? canonicalizeContentDocumentV2(parsed)
    : parsed.schemaVersion === 3
      ? canonicalizeContentDocumentV3(parsed)
      : parsed.schemaVersion === 4
        ? canonicalizeContentDocumentV4(parsed)
        : parsed;
}

export function segmentContentDocumentV1(document: ContentDocumentV1): readonly string[] {
  const lines = document.script.text.split("\n").filter((line) => !/^\s*$/u.test(line));
  return lines.length > 0 ? lines : [""];
}

export function materializeContentDocumentV2(document: ContentDocumentV1): ContentDocumentV2 {
  return canonicalizeContentDocumentV2({
    schemaVersion: 2,
    script: {
      blocks: segmentContentDocumentV1(document).map((text, index) => ({
        id: deterministicLegacyBlockId(text, index),
        type: "paragraph",
        text,
        performanceDirections: [],
        editDirections: [],
      })),
    },
  });
}

function deterministicLegacyBlockId(text: string, index = 0): string {
  const digest = createHash("sha256")
    .update(`content-document-v1-block:${index}:${text}`, "utf8")
    .digest();
  const bytes = Uint8Array.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A deliberately presentation-neutral, deterministic representation for
 * recovering unsaved V2 work after an optimistic-concurrency conflict. It is
 * not a storage or import format: identifiers and persistence metadata are
 * intentionally omitted.
 */
export function exportContentDocumentV2Recovery(input: unknown): string {
  const document = canonicalizeContentDocumentV2(input);
  const lines: string[] = ["Script"];

  for (const block of document.script.blocks) {
    lines.push(block.text);

    for (const direction of block.performanceDirections) {
      lines.push(`Performance direction: ${describePerformanceDirection(direction)}`);
    }
    for (const direction of block.editDirections) {
      lines.push(`Edit direction: ${describeEditDirection(direction)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Recovery is deliberately a human-readable boundary, never a transport format.
 * Asset identities are omitted; a later authorized read may enrich this with a
 * current display name, but conflict copy must never leak an ID or capability.
 */
export function exportContentDocumentV3Recovery(
  input: unknown,
  assetPresentations: Readonly<
    Record<string, Readonly<{ displayName: string; mediaType: string }>>
  > = {},
  labels: Readonly<{ attachedMedia: string; unavailable: string }> = {
    attachedMedia: "Attached media",
    unavailable: "unavailable",
  },
): string {
  const document = canonicalizeContentDocumentV3(input);
  const lines: string[] = ["Script"];
  for (const block of document.script.blocks) {
    lines.push(block.text);
    for (const direction of block.performanceDirections)
      lines.push(`Performance direction: ${describePerformanceDirection(direction)}`);
    for (const direction of block.editDirections) {
      lines.push(`Edit direction: ${describeEditDirection(direction)}`);
      if ((direction.type === "BROLL_CUE" || direction.type === "SOUND_CUE") && direction.assetId) {
        const asset = assetPresentations[direction.assetId];
        lines.push(
          `${labels.attachedMedia}: ${asset ? `${asset.displayName} (${asset.mediaType})` : labels.unavailable}`,
        );
      }
    }
  }
  return lines.join("\n");
}
export const exportContentDocumentV4Recovery = exportContentDocumentV3Recovery;

function appendNuance(summary: string, nuance: string | undefined): string {
  return nuance === undefined ? summary : `${summary} — ${nuance}`;
}

function describePerformanceDirection(direction: PerformanceDirection): string {
  switch (direction.type) {
    case "PAUSE":
      return appendNuance(`Pause (${direction.duration})`, direction.nuance);
    case "EMPHASIS":
      return appendNuance(`Emphasis (${direction.strength})`, direction.nuance);
    case "DELIVERY":
      return appendNuance(
        `Delivery (${[direction.tone, direction.pace].filter(Boolean).join(", ")})`,
        direction.nuance,
      );
    case "GESTURE":
      return appendNuance(`Gesture (${direction.kind})`, direction.nuance);
    case "POSITION":
      return appendNuance(`Position (${direction.action})`, direction.nuance);
    case "GAZE":
      return appendNuance(`Gaze (${direction.target})`, direction.nuance);
    case "PERFORMANCE_NOTE":
      return direction.text;
  }
}

function describeEditDirection(direction: EditDirection): string {
  switch (direction.type) {
    case "TEXT_OVERLAY":
      return appendNuance(
        `Text overlay (${direction.placement}): ${direction.text}`,
        direction.nuance,
      );
    case "ZOOM":
      return appendNuance(`Zoom (${direction.mode}, ${direction.intensity})`, direction.nuance);
    case "CUT":
      return appendNuance(`Cut (${direction.style})`, direction.nuance);
    case "BROLL_CUE":
      return appendNuance(
        `B-roll cue: ${direction.description}${"searchQuery" in direction && direction.searchQuery ? `; Search query: ${direction.searchQuery}` : ""}`,
        direction.nuance,
      );
    case "SOUND_CUE":
      return appendNuance(
        `Sound cue (${direction.kind}): ${direction.description}`,
        direction.nuance,
      );
    case "CAPTION_EMPHASIS":
      return appendNuance(`Caption emphasis (${direction.style})`, direction.nuance);
    case "EDIT_NOTE":
      return direction.text;
  }
}

export function contentDocumentsEqual(left: unknown, right: unknown): boolean {
  const leftDocument = parseContentDocument(left);
  const rightDocument = parseContentDocument(right);

  if (leftDocument.schemaVersion === 2 && rightDocument.schemaVersion === 3)
    return contentDocumentsEqual(projectContentDocumentV2ToV3(leftDocument), rightDocument);
  if (leftDocument.schemaVersion === 3 && rightDocument.schemaVersion === 2)
    return contentDocumentsEqual(leftDocument, projectContentDocumentV2ToV3(rightDocument));
  if (leftDocument.schemaVersion === 3 && rightDocument.schemaVersion === 4)
    return contentDocumentsEqual(projectContentDocumentV3ToV4(leftDocument), rightDocument);
  if (leftDocument.schemaVersion === 4 && rightDocument.schemaVersion === 3)
    return contentDocumentsEqual(leftDocument, projectContentDocumentV3ToV4(rightDocument));

  if (leftDocument.schemaVersion !== rightDocument.schemaVersion) return false;

  // Compare validated canonical values structurally. JSON serialization is not
  // a document-equality contract because equivalent object values can arrive
  // with different property insertion order.
  const equal = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((value, index) => equal(value, b[index]));
    }

    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const aKeys = Object.keys(aRecord);
    const bKeys = Object.keys(bRecord);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((key) => Object.hasOwn(bRecord, key) && equal(aRecord[key], bRecord[key]))
    );
  };

  return equal(leftDocument, rightDocument);
}

export function deriveContentAcceptanceState(
  input: Readonly<{
    acceptedVersionId: string | null | undefined;
    draftDocument: unknown;
    acceptedDocument: unknown;
  }>,
): ContentAcceptanceState {
  if (!input.acceptedVersionId || input.acceptedDocument == null) return "NOT_ACCEPTED";
  return contentDocumentsEqual(input.draftDocument, input.acceptedDocument)
    ? "ACCEPTED"
    : "UNACCEPTED_CHANGES";
}

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

const generatedNuanceSchema = z.string().max(productionDirectionLimits.nuance).optional();
const generatedPerformanceDirectionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("PAUSE"),
      duration: z.enum(productionDirectionValues.duration),
      nuance: generatedNuanceSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("EMPHASIS"),
      strength: z.enum(productionDirectionValues.strength),
      nuance: generatedNuanceSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("DELIVERY"),
      tone: z.enum(productionDirectionValues.tone).optional(),
      pace: z.enum(productionDirectionValues.pace).optional(),
      nuance: generatedNuanceSchema,
    })
    .strict()
    .refine((value) => value.tone !== undefined || value.pace !== undefined),
  z
    .object({
      type: z.literal("GESTURE"),
      kind: z.enum(productionDirectionValues.gesture),
      nuance: generatedNuanceSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("POSITION"),
      action: z.enum(productionDirectionValues.position),
      nuance: generatedNuanceSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("GAZE"),
      target: z.enum(productionDirectionValues.gaze),
      nuance: generatedNuanceSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("PERFORMANCE_NOTE"),
      text: z.string().max(productionDirectionLimits.note),
    })
    .strict(),
]);
const generatedEditDirectionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("TEXT_OVERLAY"),
      text: z.string().max(productionDirectionLimits.overlay),
      placement: z.enum(productionDirectionValues.placement),
      nuance: generatedNuanceSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("ZOOM"),
      mode: z.enum(productionDirectionValues.zoomMode),
      intensity: z.enum(productionDirectionValues.zoomIntensity),
      nuance: generatedNuanceSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("CUT"),
      style: z.enum(productionDirectionValues.cut),
      nuance: generatedNuanceSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("BROLL_CUE"),
      description: z.string().min(1).max(productionDirectionLimits.note),
      searchQuery: searchQuerySchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("SOUND_CUE"),
      kind: z.enum(productionDirectionValues.soundKind),
      description: z.string().max(productionDirectionLimits.soundCue),
      nuance: generatedNuanceSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("CAPTION_EMPHASIS"),
      style: z.enum(productionDirectionValues.caption),
      nuance: generatedNuanceSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("EDIT_NOTE"), text: z.string().max(productionDirectionLimits.note) })
    .strict(),
]);
export const generatedContentDocumentV4Schema = z
  .object({
    schemaVersion: z.literal(1),
    script: z
      .object({
        blocks: z
          .array(
            z
              .object({
                type: z.literal("paragraph"),
                text: z
                  .string()
                  .min(1)
                  .max(50_000)
                  .refine((value) => !/[\r\n]/u.test(value)),
                performanceDirections: z
                  .array(generatedPerformanceDirectionSchema)
                  .max(productionDirectionLimits.perBlockCategory),
                editDirections: z
                  .array(generatedEditDirectionSchema)
                  .max(productionDirectionLimits.perBlockCategory),
              })
              .strict(),
          )
          .min(1)
          .max(1000),
      })
      .strict(),
  })
  .strict();

/** Validates untrusted provider structure, then creates all persistent IDs locally. */
export function parseGeneratedContentDocumentV4(input: unknown): ContentDocumentV4 {
  const normalized =
    typeof input === "object" && input !== null
      ? {
          ...(input as Record<string, unknown>),
          script:
            typeof (input as { script?: unknown }).script === "object" &&
            (input as { script: { blocks?: unknown } }).script !== null
              ? {
                  ...(input as { script: Record<string, unknown> }).script,
                  blocks: Array.isArray((input as { script: { blocks?: unknown[] } }).script.blocks)
                    ? (input as { script: { blocks: unknown[] } }).script.blocks.map((block) =>
                        typeof block === "object" &&
                        block !== null &&
                        typeof (block as { text?: unknown }).text === "string"
                          ? {
                              ...(block as Record<string, unknown>),
                              text: (block as { text: string }).text.replace(/\r\n?/g, "\n").trim(),
                            }
                          : block,
                      )
                    : (input as { script: { blocks?: unknown } }).script.blocks,
                }
              : (input as Record<string, unknown>).script,
        }
      : input;
  const generated = generatedContentDocumentV4Schema.parse(normalized);
  for (const block of generated.script.blocks)
    for (const direction of block.editDirections)
      if (
        direction.type === "BROLL_CUE" &&
        (/(?:https?:\/\/|www\.)/iu.test(direction.searchQuery) ||
          /(?:pexels|pixabay|unsplash|pinterest)\s*(?:id|\d+)/iu.test(direction.searchQuery))
      )
        throw new z.ZodError([
          { code: "custom", path: [], message: "Generated B-roll query is not plain search text." },
        ]);
  return canonicalizeContentDocumentV4({
    schemaVersion: 4,
    script: {
      blocks: generated.script.blocks.map((block) => ({
        ...block,
        id: randomUUID(),
        performanceDirections: block.performanceDirections.map((direction) => ({
          ...direction,
          id: randomUUID(),
        })),
        editDirections: block.editDirections.map((direction) => ({
          ...direction,
          id: randomUUID(),
        })),
      })),
    },
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
