import { z } from "zod";

import { assetMediaTypeSchema, type AssetMediaType } from "./asset-contracts";

export const assetByteLimits = {
  IMAGE: 10 * 1024 * 1024,
  VIDEO: 500 * 1024 * 1024,
  AUDIO: 100 * 1024 * 1024,
} as const satisfies Record<AssetMediaType, number>;

const uploadExtensionMediaTypes: Record<AssetMediaType, readonly string[]> = {
  IMAGE: [".jpg", ".jpeg", ".png", ".webp"],
  VIDEO: [".mp4"],
  AUDIO: [".mp3", ".m4a", ".wav"],
};

const unsafeTextPattern = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

export const uploadBeginInputSchema = z
  .object({
    workspaceId: z.uuid(),
    mediaType: assetMediaTypeSchema,
    displayName: z.string(),
    originalFilename: z.string(),
    expectedUploadSizeBytes: z.number().int().positive(),
    browserMimeType: z.string().min(1).optional(),
  })
  .strict();

export type UploadBeginInput = z.infer<typeof uploadBeginInputSchema>;

export function normalizeUploadBeginInput(input: unknown): UploadBeginInput {
  const parsed = uploadBeginInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("INVALID_UPLOAD_INPUT");

  const displayName = parsed.data.displayName.trim();
  const originalFilename = parsed.data.originalFilename;
  if (
    !isSafeCreatorText(displayName) ||
    codePointLength(displayName) < 1 ||
    codePointLength(displayName) > 200 ||
    !isSafeLeafFilename(originalFilename) ||
    !hasCompatibleExtension(originalFilename, parsed.data.mediaType) ||
    parsed.data.expectedUploadSizeBytes > assetByteLimits[parsed.data.mediaType] ||
    !Number.isSafeInteger(parsed.data.expectedUploadSizeBytes)
  )
    throw new Error("INVALID_UPLOAD_INPUT");

  return { ...parsed.data, displayName, originalFilename };
}

export function isSafeCreatorText(value: string): boolean {
  return value.length > 0 && !unsafeTextPattern.test(value);
}

export function isSafeLeafFilename(value: string): boolean {
  return (
    value.length > 0 &&
    codePointLength(value) <= 255 &&
    !unsafeTextPattern.test(value) &&
    !/[\\/]/u.test(value) &&
    value !== "." &&
    value !== ".."
  );
}

export function hasCompatibleExtension(filename: string, mediaType: AssetMediaType): boolean {
  const extension = uploadFilenameExtension(filename);
  return extension !== undefined && uploadExtensionMediaTypes[mediaType].includes(extension);
}

export function uploadFilenameExtension(filename: string): string | undefined {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot).toLowerCase() : undefined;
}

export function codePointLength(value: string): number {
  return [...value].length;
}

export function isUploadCapabilityEligible(
  input: Readonly<{
    sourceType: string;
    status: string;
    finalized: boolean;
    createdAt: Date;
    now: Date;
  }>,
): boolean {
  return (
    input.sourceType === "UPLOAD" &&
    input.status === "PENDING" &&
    !input.finalized &&
    input.now.getTime() - input.createdAt.getTime() < 24 * 60 * 60_000
  );
}
