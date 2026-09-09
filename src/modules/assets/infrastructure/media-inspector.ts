import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";

import type { MediaInspector, MediaInspectionInput } from "../application/media-inspector";
import { MediaInspectionError } from "../domain/media-inspection-contracts";
import type { MediaInspectionResult } from "../domain/media-inspection-contracts";
import { FfprobeMediaInspector } from "./ffprobe-media-inspector";
import { SharpMediaInspector } from "./sharp-media-inspector";

/** Provider-neutral composition root for the two approved inspection adapters. */
export class DefaultMediaInspector implements MediaInspector {
  constructor(
    private readonly imageInspector: MediaInspector = new SharpMediaInspector(),
    private readonly avInspector: MediaInspector = new FfprobeMediaInspector({
      executablePath: process.env.FFPROBE_PATH ?? "ffprobe",
      ...(process.env.FFPROBE_EXPECTED_VERSION
        ? { expectedVersion: process.env.FFPROBE_EXPECTED_VERSION }
        : {}),
    }),
  ) {}

  async inspect(input: MediaInspectionInput): Promise<MediaInspectionResult> {
    if (!isAbsolute(input.filePath) || input.filePath.includes("\0"))
      throw new MediaInspectionError("PROCESSING_UNAVAILABLE", "Inspection file is unavailable.");
    const family = await sniffMediaFamily(input.filePath);
    if (family !== undefined && family !== input.declaredMediaType)
      throw new MediaInspectionError(
        "MEDIA_TYPE_MISMATCH",
        "Detected media type does not match the declaration.",
      );
    return (input.declaredMediaType === "IMAGE" ? this.imageInspector : this.avInspector).inspect(
      input,
    );
  }
}

async function sniffMediaFamily(
  filePath: string,
): Promise<"IMAGE" | "VIDEO" | "AUDIO" | undefined> {
  const handle = await open(filePath, "r").catch(() => {
    throw new MediaInspectionError("PROCESSING_UNAVAILABLE", "Inspection file is unavailable.");
  });
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.byteLength, 0);
    if (bytesRead >= 3 && header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
      return "IMAGE";
    if (
      bytesRead >= 8 &&
      header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
      return "IMAGE";
    if (
      bytesRead >= 12 &&
      header.toString("ascii", 0, 4) === "RIFF" &&
      header.toString("ascii", 8, 12) === "WEBP"
    )
      return "IMAGE";
    if (bytesRead >= 12 && header.toString("ascii", 4, 8) === "ftyp") {
      const brand = header.toString("ascii", 8, 12).trim().toLowerCase();
      return brand.startsWith("m4a") ? "AUDIO" : undefined;
    }
    if (
      bytesRead >= 12 &&
      header.toString("ascii", 0, 4) === "RIFF" &&
      header.toString("ascii", 8, 12) === "WAVE"
    )
      return "AUDIO";
    if (bytesRead >= 3 && header.toString("ascii", 0, 3) === "ID3") return "AUDIO";
    if (bytesRead >= 2 && header[0] === 0xff && (header[1]! & 0xe0) === 0xe0) return "AUDIO";
    return undefined;
  } finally {
    await handle.close();
  }
}
