import { z } from "zod";

export const assetMediaTypeSchema = z.enum(["IMAGE", "VIDEO", "AUDIO"]);
export const assetSourceTypeSchema = z.enum(["UPLOAD", "EXTERNAL_URL"]);
export const assetStatusSchema = z.enum(["PENDING", "PROCESSING", "READY", "FAILED", "DELETING"]);
export const assetFailureCodeSchema = z.enum([
  "UPLOAD_EXPIRED",
  "MEDIA_TOO_LARGE",
  "MEDIA_LIMIT_EXCEEDED",
  "MEDIA_TYPE_MISMATCH",
  "UNSUPPORTED_MEDIA",
  "INVALID_MEDIA",
  "UNSAFE_MEDIA_URL",
  "MEDIA_SOURCE_UNAVAILABLE",
  "PROCESSING_UNAVAILABLE",
]);
export type AssetMediaType = z.infer<typeof assetMediaTypeSchema>;
export type AssetSourceType = z.infer<typeof assetSourceTypeSchema>;
export type AssetStatus = z.infer<typeof assetStatusSchema>;

/** Runtime boundary for the immutable source-specific Asset facts. */
export const assetPersistenceSchema = z.discriminatedUnion("sourceType", [
  z
    .object({
      workspaceId: z.uuid(),
      createdByUserId: z.string().min(1),
      mediaType: assetMediaTypeSchema,
      sourceType: z.literal("UPLOAD"),
      status: assetStatusSchema,
      displayName: z.string().min(1).max(200),
      originalFilename: z.string().min(1),
      declaredByteSize: z.number().int().positive().optional(),
      declaredMimeType: z.string().min(1).optional(),
      sourceUrl: z.never().optional(),
      sourceHost: z.never().optional(),
    })
    .strict(),
  z
    .object({
      workspaceId: z.uuid(),
      createdByUserId: z.string().min(1),
      mediaType: assetMediaTypeSchema,
      sourceType: z.literal("EXTERNAL_URL"),
      status: assetStatusSchema,
      displayName: z.string().min(1).max(200),
      sourceUrl: z.url(),
      sourceHost: z.string().min(1),
      originalFilename: z.never().optional(),
      declaredByteSize: z.never().optional(),
      declaredMimeType: z.never().optional(),
    })
    .strict(),
]);

export function assetMediaTypeIsCompatible(
  directionType: "BROLL_CUE" | "SOUND_CUE",
  mediaType: AssetMediaType,
): boolean {
  return directionType === "BROLL_CUE"
    ? mediaType === "IMAGE" || mediaType === "VIDEO"
    : mediaType === "AUDIO";
}
