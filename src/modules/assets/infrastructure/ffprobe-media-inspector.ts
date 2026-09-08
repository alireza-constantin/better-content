import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { z } from "zod";

import type { MediaInspector, MediaInspectionInput } from "../application/media-inspector";
import {
  assertMediaExtension,
  MediaInspectionError,
  type MediaInspectionResult,
} from "../domain/media-inspection-contracts";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_DIMENSION = 3_840;
const MAX_VIDEO_PIXELS = 8_294_400;
const MAX_VIDEO_DURATION_MS = 1_800_000;
const MAX_AUDIO_DURATION_MS = 3_600_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;

const ffprobeOutputSchema = z
  .object({
    streams: z.array(z.record(z.string(), z.unknown())),
    format: z.record(z.string(), z.unknown()),
  })
  .strict();

export type FfprobeProcessResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export type FfprobeProcess = (
  executablePath: string,
  args: readonly string[],
  options: Readonly<{ timeoutMs: number; maxOutputBytes: number }>,
) => Promise<FfprobeProcessResult>;

export function createSafeFfprobeProcess(): FfprobeProcess {
  return (executablePath, args, options) =>
    new Promise((resolve, reject) => {
      execFile(
        executablePath,
        [...args],
        {
          shell: false,
          timeout: options.timeoutMs,
          maxBuffer: options.maxOutputBytes,
          windowsHide: true,
          encoding: "utf8",
        },
        (error, stdout, stderr) => {
          const output = typeof stdout === "string" ? stdout : "";
          const errorOutput = typeof stderr === "string" ? stderr : "";
          if (
            error &&
            (error.killed ||
              error.code === "ETIMEDOUT" ||
              error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ||
              error.code === "ENOENT" ||
              error.code === "EACCES")
          ) {
            reject(new Error("ffprobe process limit exceeded."));
            return;
          }
          resolve({
            exitCode: error ? (typeof error.code === "number" ? error.code : 1) : 0,
            stdout: output,
            stderr: errorOutput,
          });
        },
      ).on("error", () => reject(new Error("ffprobe process unavailable.")));
    });
}

export class FfprobeMediaInspector implements MediaInspector {
  constructor(
    private readonly options: Readonly<{
      executablePath: string;
      execute?: FfprobeProcess;
      timeoutMs?: number;
      maxOutputBytes?: number;
      expectedVersion?: string;
    }>,
  ) {}

  async verifyRuntime(): Promise<void> {
    const result = await this.run(["-version"]);
    const version = /^ffprobe version ([^\s]+)/m.exec(result.stdout)?.[1];
    if (
      result.exitCode !== 0 ||
      version === undefined ||
      (this.options.expectedVersion !== undefined && version !== this.options.expectedVersion)
    )
      throw new MediaInspectionError(
        "PROCESSING_UNAVAILABLE",
        "Media inspection runtime is unavailable.",
      );
  }

  async inspect(input: MediaInspectionInput): Promise<MediaInspectionResult> {
    if (!isAbsolute(input.filePath) || input.filePath.includes("\0"))
      throw new MediaInspectionError("PROCESSING_UNAVAILABLE", "Inspection file is unavailable.");
    const sizeBytes = await fileSize(input.filePath);
    const maxBytes = input.declaredMediaType === "VIDEO" ? MAX_VIDEO_BYTES : MAX_AUDIO_BYTES;
    if (sizeBytes > maxBytes)
      throw new MediaInspectionError("MEDIA_LIMIT_EXCEEDED", "Media byte limit exceeded.");
    const result = await this.run([
      "-v",
      "error",
      "-hide_banner",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      "-protocol_whitelist",
      "file",
      input.filePath,
    ]);
    if (result.exitCode !== 0)
      throw new MediaInspectionError("INVALID_MEDIA", "Media bytes could not be inspected.");

    let parsed: z.infer<typeof ffprobeOutputSchema>;
    try {
      parsed = ffprobeOutputSchema.parse(JSON.parse(result.stdout));
    } catch {
      throw new MediaInspectionError(
        "PROCESSING_UNAVAILABLE",
        "Media inspection output was invalid.",
      );
    }
    return normalizeFfprobeResult(parsed, input, sizeBytes);
  }

  private async run(args: readonly string[]): Promise<FfprobeProcessResult> {
    try {
      return await (this.options.execute ?? createSafeFfprobeProcess())(
        this.options.executablePath,
        args,
        {
          timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          maxOutputBytes: this.options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
        },
      );
    } catch {
      throw new MediaInspectionError(
        "PROCESSING_UNAVAILABLE",
        "Media inspection runtime is unavailable.",
      );
    }
  }
}

async function fileSize(filePath: string): Promise<number> {
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

function normalizeFfprobeResult(
  parsed: z.infer<typeof ffprobeOutputSchema>,
  input: MediaInspectionInput,
  sizeBytes: number,
): MediaInspectionResult {
  const videoStreams = parsed.streams.filter((stream) => readString(stream.codec_type) === "video");
  const audioStreams = parsed.streams.filter((stream) => readString(stream.codec_type) === "audio");
  const formatName = readString(parsed.format.format_name);
  if (!formatName) throw new MediaInspectionError("INVALID_MEDIA", "Media container is invalid.");

  if (input.declaredMediaType === "VIDEO") {
    if (videoStreams.length === 0)
      throw new MediaInspectionError("MEDIA_TYPE_MISMATCH", "Media is not video.");
    if (!isMp4Container(formatName, parsed.format))
      throw new MediaInspectionError("UNSUPPORTED_MEDIA", "Video container is not supported.");
    const video = videoStreams[0]!;
    if (readString(video.codec_name) !== "h264")
      throw new MediaInspectionError("UNSUPPORTED_MEDIA", "Video codec is not supported.");
    if (audioStreams.some((stream) => readString(stream.codec_name) !== "aac"))
      throw new MediaInspectionError("UNSUPPORTED_MEDIA", "Audio codec is not supported.");
    const dimensions = displayDimensions(video);
    enforceVideoDimensions(dimensions.width, dimensions.height);
    const durationMs = durationMilliseconds(parsed.format, video);
    if (durationMs > MAX_VIDEO_DURATION_MS)
      throw new MediaInspectionError("MEDIA_LIMIT_EXCEEDED", "Video duration limit exceeded.");
    assertMediaExtension(input.originalFilename, "VIDEO", "MP4");
    return {
      mediaType: "VIDEO",
      mediaFormat: "MP4",
      sizeBytes,
      width: dimensions.width,
      height: dimensions.height,
      durationMs,
      videoCodec: "H264",
      ...(audioStreams.length ? { audioCodec: "AAC" } : {}),
    };
  }

  if (videoStreams.length)
    throw new MediaInspectionError("MEDIA_TYPE_MISMATCH", "Media is not audio.");
  if (audioStreams.length !== 1)
    throw new MediaInspectionError("INVALID_MEDIA", "Audio stream is invalid.");
  const audio = audioStreams[0]!;
  const codec = readString(audio.codec_name);
  const names = formatName.split(",");
  let mediaFormat: "MP3" | "M4A" | "WAV";
  let audioCodec: string;
  if (codec === "mp3" && names.includes("mp3")) {
    mediaFormat = "MP3";
    audioCodec = "MP3 Layer III";
  } else if (codec === "aac" && isM4aContainer(formatName, parsed.format)) {
    mediaFormat = "M4A";
    audioCodec = "AAC";
  } else if (codec?.startsWith("pcm_") && names.includes("wav")) {
    mediaFormat = "WAV";
    audioCodec = "PCM";
  } else {
    throw new MediaInspectionError(
      "UNSUPPORTED_MEDIA",
      "Audio container or codec is not supported.",
    );
  }
  const durationMs = durationMilliseconds(parsed.format, audio);
  if (durationMs > MAX_AUDIO_DURATION_MS)
    throw new MediaInspectionError("MEDIA_LIMIT_EXCEEDED", "Audio duration limit exceeded.");
  assertMediaExtension(input.originalFilename, "AUDIO", mediaFormat);
  return { mediaType: "AUDIO", mediaFormat, sizeBytes, durationMs, audioCodec };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().toLowerCase()
    : undefined;
}

function isMp4Container(formatName: string, format: Record<string, unknown>): boolean {
  if (!formatName.split(",").includes("mp4")) return false;
  const majorBrand = readString(asRecord(format.tags)?.major_brand);
  return majorBrand === undefined || ["isom", "iso2", "mp41", "mp42", "avc1"].includes(majorBrand);
}

function isM4aContainer(formatName: string, format: Record<string, unknown>): boolean {
  if (!formatName.split(",").some((name) => name === "m4a" || name === "mp4")) return false;
  const majorBrand = readString(asRecord(format.tags)?.major_brand);
  return (
    majorBrand === undefined ||
    ["isom", "iso2", "mp41", "mp42", "m4a", "m4b", "m4p"].includes(majorBrand)
  );
}

function readNumber(value: unknown): number | undefined {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function durationMilliseconds(
  format: Record<string, unknown>,
  stream: Record<string, unknown>,
): number {
  const seconds = readNumber(format.duration) ?? readNumber(stream.duration);
  if (seconds === undefined || seconds <= 0)
    throw new MediaInspectionError("INVALID_MEDIA", "Media duration is invalid.");
  const durationMs = Math.ceil(seconds * 1_000);
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0)
    throw new MediaInspectionError("INVALID_MEDIA", "Media duration is invalid.");
  return durationMs;
}

function displayDimensions(stream: Record<string, unknown>): { width: number; height: number } {
  const width = readNumber(stream.width);
  const height = readNumber(stream.height);
  if (
    width === undefined ||
    height === undefined ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new MediaInspectionError("INVALID_MEDIA", "Video dimensions are invalid.");
  const rotation = readRotation(stream);
  if (rotation === undefined)
    throw new MediaInspectionError("INVALID_MEDIA", "Video rotation is invalid.");
  return Math.abs(rotation) % 180 === 90 ? { width: height, height: width } : { width, height };
}

function readRotation(stream: Record<string, unknown>): number | undefined {
  const tags = asRecord(stream.tags);
  const direct = readNumber(stream.rotation) ?? readNumber(tags?.rotate);
  if (direct !== undefined) return Number.isInteger(direct) ? direct : undefined;
  const sideData = Array.isArray(stream.side_data_list) ? stream.side_data_list : [];
  for (const item of sideData) {
    const rotation = readNumber(asRecord(item)?.rotation);
    if (rotation !== undefined) return Number.isInteger(rotation) ? rotation : undefined;
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function enforceVideoDimensions(width: number, height: number): void {
  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_VIDEO_PIXELS)
    throw new MediaInspectionError("MEDIA_LIMIT_EXCEEDED", "Video dimensions exceed the limit.");
}
