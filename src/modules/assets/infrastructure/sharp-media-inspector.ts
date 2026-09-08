import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

import sharp, { type Metadata } from "sharp";

import type { MediaInspector, MediaInspectionInput } from "../application/media-inspector";
import {
  assertMediaExtension,
  assertMediaType,
  MediaInspectionError,
  mediaMimeType,
  type MediaInspectionResult,
} from "../domain/media-inspection-contracts";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 12_000;
const MAX_IMAGE_PIXELS = 60_000_000;

const displayOriented = new Set([5, 6, 7, 8]);

export class SharpMediaInspector implements MediaInspector {
  async inspect(input: MediaInspectionInput): Promise<MediaInspectionResult> {
    assertMediaType(input.declaredMediaType, "IMAGE");
    if (!isAbsolute(input.filePath) || input.filePath.includes("\0"))
      throw new MediaInspectionError("PROCESSING_UNAVAILABLE", "Inspection file is unavailable.");
    const sizeBytes = await fileSize(input.filePath);
    if (sizeBytes > MAX_IMAGE_BYTES)
      throw new MediaInspectionError("MEDIA_LIMIT_EXCEEDED", "Image byte limit exceeded.");

    let metadata: Metadata;
    try {
      metadata = await sharp(await readFile(input.filePath), {
        limitInputPixels: MAX_IMAGE_PIXELS,
        sequentialRead: true,
      }).metadata();
    } catch (error) {
      if (isPixelLimitError(error))
        throw new MediaInspectionError("MEDIA_LIMIT_EXCEEDED", "Image pixel limit exceeded.");
      throw new MediaInspectionError("INVALID_MEDIA", "Image bytes could not be inspected.");
    }

    const format = normalizeImageFormat(metadata.format);
    if (!format)
      throw new MediaInspectionError("UNSUPPORTED_MEDIA", "Image format is not supported.");
    if (metadata.pages !== undefined && metadata.pages > 1)
      throw new MediaInspectionError("UNSUPPORTED_MEDIA", "Animated images are not supported.");

    assertMediaExtension(input.originalFilename, "IMAGE", format);
    const width = positiveInteger(metadata.width);
    const height = positiveInteger(metadata.height);
    if (width === null || height === null)
      throw new MediaInspectionError("INVALID_MEDIA", "Image dimensions are invalid.");
    const displayWidth = displayOriented.has(metadata.orientation ?? 1) ? height : width;
    const displayHeight = displayOriented.has(metadata.orientation ?? 1) ? width : height;
    if (
      displayWidth > MAX_IMAGE_DIMENSION ||
      displayHeight > MAX_IMAGE_DIMENSION ||
      displayWidth * displayHeight > MAX_IMAGE_PIXELS
    )
      throw new MediaInspectionError("MEDIA_LIMIT_EXCEEDED", "Image dimensions exceed the limit.");

    return {
      mediaType: "IMAGE",
      mediaFormat: format,
      sizeBytes,
      width: displayWidth,
      height: displayHeight,
    };
  }
}

async function fileSize(filePath: string): Promise<number> {
  if (typeof filePath !== "string" || filePath.includes("\0"))
    throw new MediaInspectionError("PROCESSING_UNAVAILABLE", "Inspection file is unavailable.");
  try {
    const file = await stat(filePath);
    if (!file.isFile() || !Number.isSafeInteger(file.size) || file.size <= 0)
      throw new MediaInspectionError("INVALID_MEDIA", "Inspection file is invalid.");
    return file.size;
  } catch (error) {
    if (error instanceof MediaInspectionError) throw error;
    throw new MediaInspectionError("PROCESSING_UNAVAILABLE", "Inspection file is unavailable.");
  }
}

function normalizeImageFormat(format: string | undefined): "JPEG" | "PNG" | "WEBP" | null {
  if (format === "jpeg") return "JPEG";
  if (format === "png") return "PNG";
  if (format === "webp") return "WEBP";
  return null;
}

function positiveInteger(value: number | undefined): number | null {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function isPixelLimitError(error: unknown): boolean {
  return error instanceof Error && /pixel limit|too many pixels/i.test(error.message);
}

export function imageResultMimeType(result: MediaInspectionResult): string {
  return mediaMimeType(result.mediaFormat);
}
