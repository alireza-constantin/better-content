import { z } from "zod";

import { assetMediaTypeSchema, type AssetMediaType } from "./asset-contracts";

export const mediaTypeSchema = assetMediaTypeSchema;
export const mediaFormatSchema = z.enum(["JPEG", "PNG", "WEBP", "MP4", "MP3", "M4A", "WAV"]);
export const mediaInspectionFailureCodeSchema = z.enum([
  "MEDIA_TYPE_MISMATCH",
  "UNSUPPORTED_MEDIA",
  "INVALID_MEDIA",
  "MEDIA_LIMIT_EXCEEDED",
  "PROCESSING_UNAVAILABLE",
]);

export const mediaInspectionResultSchema = z
  .object({
    mediaType: mediaTypeSchema,
    mediaFormat: mediaFormatSchema,
    sizeBytes: z.number().int().positive(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationMs: z.number().int().positive().optional(),
    videoCodec: z.string().min(1).optional(),
    audioCodec: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.width === undefined) !== (value.height === undefined)) {
      context.addIssue({ code: "custom", message: "Dimensions must be supplied together." });
    }
  });

export type MediaType = AssetMediaType;
export type MediaFormat = z.infer<typeof mediaFormatSchema>;
export type MediaInspectionFailureCode = z.infer<typeof mediaInspectionFailureCodeSchema>;
export type MediaInspectionResult = z.infer<typeof mediaInspectionResultSchema>;

export class MediaInspectionError extends Error {
  constructor(
    readonly code: MediaInspectionFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "MediaInspectionError";
  }
}

export function mediaMimeType(format: MediaFormat): string {
  return {
    JPEG: "image/jpeg",
    PNG: "image/png",
    WEBP: "image/webp",
    MP4: "video/mp4",
    MP3: "audio/mpeg",
    M4A: "audio/mp4",
    WAV: "audio/wav",
  }[format];
}

const imageExtensions = new Map<string, MediaFormat>([
  [".jpg", "JPEG"],
  [".jpeg", "JPEG"],
  [".png", "PNG"],
  [".webp", "WEBP"],
]);
const videoExtensions = new Map<string, MediaFormat>([[".mp4", "MP4"]]);
const audioExtensions = new Map<string, MediaFormat>([
  [".mp3", "MP3"],
  [".m4a", "M4A"],
  [".mp4", "M4A"],
  [".wav", "WAV"],
]);

export function assertMediaExtension(
  filename: string | undefined,
  mediaType: MediaType,
  detectedFormat: MediaFormat,
): void {
  if (filename === undefined) return;
  const leafName = filename.split(/[\\/]/).pop() ?? "";
  const dot = leafName.lastIndexOf(".");
  const extension = dot >= 0 ? leafName.slice(dot).toLowerCase() : "";
  const formats =
    mediaType === "IMAGE"
      ? imageExtensions
      : mediaType === "VIDEO"
        ? videoExtensions
        : audioExtensions;
  if (formats.get(extension) !== detectedFormat)
    throw new MediaInspectionError(
      "MEDIA_TYPE_MISMATCH",
      "Media extension does not match detected media.",
    );
}

export function assertMediaType(expected: MediaType, detected: MediaType): void {
  if (expected !== detected)
    throw new MediaInspectionError(
      "MEDIA_TYPE_MISMATCH",
      "Detected media type does not match the declaration.",
    );
}
