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

export const contentDocumentSchema = z.union([
  contentScriptDocumentSchema,
  contentDocumentV2Schema,
]);
export type ContentDocument = z.infer<typeof contentDocumentSchema>;

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

export function parseContentDocument(input: unknown): ContentDocument {
  const parsed = contentDocumentSchema.parse(input);
  return parsed.schemaVersion === 2 ? canonicalizeContentDocumentV2(parsed) : parsed;
}

export function segmentContentDocumentV1(document: ContentDocumentV1): readonly string[] {
  const lines = document.script.text.split("\n").filter((line) => !/^\s*$/u.test(line));
  return lines.length > 0 ? lines : [""];
}

export function materializeContentDocumentV2(document: ContentDocumentV1): ContentDocumentV2 {
  return canonicalizeContentDocumentV2({
    schemaVersion: 2,
    script: {
      blocks: segmentContentDocumentV1(document).map((text) => ({
        id: crypto.randomUUID(),
        type: "paragraph",
        text,
        performanceDirections: [],
        editDirections: [],
      })),
    },
  });
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
      return appendNuance(`B-roll cue: ${direction.description}`, direction.nuance);
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
