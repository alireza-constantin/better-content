import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { MediaInspectionError } from "../domain/media-inspection-contracts";
import { FfprobeMediaInspector, type FfprobeProcess } from "./ffprobe-media-inspector";
import { DefaultMediaInspector } from "./media-inspector";
import { SharpMediaInspector } from "./sharp-media-inspector";
import { withInspectionTempFile } from "./temporary-media-file";

async function withFile<T>(
  bytes: Uint8Array,
  callback: (filePath: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "better-content-inspector-test-"));
  const filePath = join(directory, "fixture.bin");
  await writeFile(filePath, bytes);
  try {
    return await callback(filePath);
  } finally {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await rm(directory, { recursive: true, force: true });
        break;
      } catch (error) {
        if (
          typeof error !== "object" ||
          error === null ||
          !("code" in error) ||
          (error.code !== "EBUSY" && error.code !== "EPERM") ||
          attempt === 4
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
  }
}

describe("SharpMediaInspector", () => {
  it("normalizes supported JPEG, PNG, and static WebP metadata", async () => {
    const inspector = new SharpMediaInspector();
    for (const [extension, format, bytes] of [
      [
        "jpg",
        "JPEG",
        await sharp({ create: { width: 2, height: 3, channels: 3, background: "red" } })
          .jpeg()
          .toBuffer(),
      ],
      [
        "png",
        "PNG",
        await sharp({ create: { width: 2, height: 3, channels: 4, background: "red" } })
          .png()
          .toBuffer(),
      ],
      [
        "webp",
        "WEBP",
        await sharp({ create: { width: 2, height: 3, channels: 4, background: "red" } })
          .webp()
          .toBuffer(),
      ],
    ] as const) {
      await withFile(bytes, async (filePath) => {
        await expect(
          inspector.inspect({
            filePath,
            declaredMediaType: "IMAGE",
            originalFilename: `fixture.${extension}`,
          }),
        ).resolves.toMatchObject({
          mediaType: "IMAGE",
          mediaFormat: format,
          sizeBytes: bytes.byteLength,
          width: 2,
          height: 3,
        });
      });
    }
  });

  it("rejects corrupt, unsupported, animated, and over-limit images safely", async () => {
    const inspector = new SharpMediaInspector();
    await withFile(Buffer.from("not-an-image"), async (filePath) => {
      await expect(
        inspector.inspect({ filePath, declaredMediaType: "IMAGE", originalFilename: "bad.jpg" }),
      ).rejects.toMatchObject({ code: "INVALID_MEDIA" });
    });
    const oversized = await sharp({
      create: { width: 12_001, height: 1, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await withFile(oversized, async (filePath) => {
      await expect(
        inspector.inspect({ filePath, declaredMediaType: "IMAGE", originalFilename: "large.png" }),
      ).rejects.toMatchObject({ code: "MEDIA_LIMIT_EXCEEDED" });
    });
    const gifHeader = Buffer.from("GIF89a");
    await withFile(gifHeader, async (filePath) => {
      await expect(
        inspector.inspect({
          filePath,
          declaredMediaType: "IMAGE",
          originalFilename: "animation.gif",
        }),
      ).rejects.toBeInstanceOf(MediaInspectionError);
    });
  });

  it("returns display-oriented dimensions without physically rotating the image", async () => {
    const bytes = await sharp({ create: { width: 2, height: 3, channels: 3, background: "red" } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    await withFile(bytes, async (filePath) => {
      await expect(
        new SharpMediaInspector().inspect({
          filePath,
          declaredMediaType: "IMAGE",
          originalFilename: "oriented.jpg",
        }),
      ).resolves.toMatchObject({ width: 3, height: 2 });
    });
  });

  it("treats extension and declared type as terminal compatibility checks", async () => {
    const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } })
      .jpeg()
      .toBuffer();
    await withFile(bytes, async (filePath) => {
      await expect(inspectorResult(filePath)).rejects.toMatchObject({
        code: "MEDIA_TYPE_MISMATCH",
      });
    });
    async function inspectorResult(filePath: string) {
      return new SharpMediaInspector().inspect({
        filePath,
        declaredMediaType: "IMAGE",
        originalFilename: "fixture.png",
      });
    }
  });
});

describe("FfprobeMediaInspector", () => {
  it("normalizes rotated H.264/AAC video and ceilings duration", async () => {
    const calls: string[][] = [];
    const execute: FfprobeProcess = async (_executable, args) => {
      calls.push([...args]);
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 1920,
              height: 1080,
              tags: { rotate: "90" },
            },
            { codec_type: "audio", codec_name: "aac" },
          ],
          format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "1.0001" },
        }),
        stderr: "",
      };
    };
    await withFile(Buffer.from("video"), async (filePath) => {
      const result = await new FfprobeMediaInspector({
        executablePath: "pinned/ffprobe",
        execute,
      }).inspect({ filePath, declaredMediaType: "VIDEO", originalFilename: "clip.mp4" });
      expect(result).toEqual({
        mediaType: "VIDEO",
        mediaFormat: "MP4",
        sizeBytes: 5,
        width: 1080,
        height: 1920,
        durationMs: 1001,
        videoCodec: "H264",
        audioCodec: "AAC",
      });
    });
    expect(calls[0]).toEqual([
      "-v",
      "error",
      "-hide_banner",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      "-protocol_whitelist",
      "file",
      expect.any(String),
    ]);
  });

  it("accepts MP3, AAC/M4A, and PCM/WAV and rejects other codecs", async () => {
    const cases = [
      [
        { codec_type: "audio", codec_name: "mp3" },
        { format_name: "mp3", duration: "2" },
        "MP3",
        "MP3 Layer III",
        "mp3",
      ],
      [
        { codec_type: "audio", codec_name: "aac" },
        { format_name: "mov,mp4,m4a", duration: "2" },
        "M4A",
        "AAC",
        "m4a",
      ],
      [
        { codec_type: "audio", codec_name: "pcm_s16le" },
        { format_name: "wav", duration: "2" },
        "WAV",
        "PCM",
        "wav",
      ],
    ] as const;
    for (const [stream, format, mediaFormat, audioCodec, extension] of cases) {
      const execute: FfprobeProcess = async () => ({
        exitCode: 0,
        stdout: JSON.stringify({ streams: [stream], format }),
        stderr: "",
      });
      await withFile(Buffer.from("audio"), async (filePath) => {
        await expect(
          new FfprobeMediaInspector({ executablePath: "ffprobe", execute }).inspect({
            filePath,
            declaredMediaType: "AUDIO",
            originalFilename: `fixture.${extension}`,
          }),
        ).resolves.toMatchObject({ mediaType: "AUDIO", mediaFormat, durationMs: 2000, audioCodec });
      });
    }
    const unsupported: FfprobeProcess = async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        streams: [{ codec_type: "audio", codec_name: "opus" }],
        format: { format_name: "ogg", duration: "2" },
      }),
      stderr: "",
    });
    await withFile(Buffer.from("audio"), async (filePath) => {
      await expect(
        new FfprobeMediaInspector({ executablePath: "ffprobe", execute: unsupported }).inspect({
          filePath,
          declaredMediaType: "AUDIO",
        }),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA" });
    });
  });

  it("normalizes malformed output, timeout, non-zero exit, and output bounds", async () => {
    const cases: Array<[FfprobeProcess, string]> = [
      [
        async () => ({ exitCode: 0, stdout: "{}", stderr: "secret parser output" }),
        "PROCESSING_UNAVAILABLE",
      ],
      [
        async () => {
          throw new Error("timeout");
        },
        "PROCESSING_UNAVAILABLE",
      ],
      [async () => ({ exitCode: 1, stdout: "raw output", stderr: "raw error" }), "INVALID_MEDIA"],
    ];
    for (const [execute, code] of cases) {
      await withFile(Buffer.from("media"), async (filePath) => {
        await expect(
          new FfprobeMediaInspector({ executablePath: "ffprobe", execute }).inspect({
            filePath,
            declaredMediaType: "AUDIO",
          }),
        ).rejects.toMatchObject({ code });
      });
    }
  });

  it("passes only fixed safe process options and file arguments", async () => {
    let observed:
      | {
          executable: string;
          args: readonly string[];
          options: Readonly<{ timeoutMs: number; maxOutputBytes: number }>;
        }
      | undefined;
    const execute: FfprobeProcess = async (executable, args, options) => {
      observed = { executable, args, options };
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          streams: [{ codec_type: "audio", codec_name: "mp3" }],
          format: { format_name: "mp3", duration: "1" },
        }),
        stderr: "",
      };
    };
    await withFile(Buffer.from("audio"), async (filePath) => {
      await new FfprobeMediaInspector({
        executablePath: "C:/pinned/ffprobe.exe",
        execute,
        timeoutMs: 1234,
        maxOutputBytes: 5678,
      }).inspect({ filePath, declaredMediaType: "AUDIO", originalFilename: "creator name.mp3" });
    });
    expect(observed).toMatchObject({
      executable: "C:/pinned/ffprobe.exe",
      options: { timeoutMs: 1234, maxOutputBytes: 5678 },
    });
    expect(observed?.args).toContain("-protocol_whitelist");
    expect(observed?.args).toContain("file");
    expect(observed?.args.at(-1)).toMatch(/fixture\.bin$/);
  });

  it("verifies the deployment-pinned ffprobe runtime without exposing output", async () => {
    const execute: FfprobeProcess = async () => ({
      exitCode: 0,
      stdout: "ffprobe version 7.0.1\nconfiguration: private-build-details",
      stderr: "",
    });
    await expect(
      new FfprobeMediaInspector({
        executablePath: "pinned/ffprobe",
        execute,
        expectedVersion: "7.0.1",
      }).verifyRuntime(),
    ).resolves.toBeUndefined();
    await expect(
      new FfprobeMediaInspector({
        executablePath: "pinned/ffprobe",
        execute,
        expectedVersion: "6.0",
      }).verifyRuntime(),
    ).rejects.toMatchObject({ code: "PROCESSING_UNAVAILABLE" });
  });
});

describe("media inspection temp boundary", () => {
  it("enforces the stream byte ceiling and cleans up after success and failure", async () => {
    await expect(
      withInspectionTempFile(chunks("123", "456"), 5, async () => "ok"),
    ).rejects.toMatchObject({ code: "MEDIA_LIMIT_EXCEEDED" });
    let temporaryPath = "";
    await expect(
      withInspectionTempFile(chunks("123"), 5, async (filePath) => {
        temporaryPath = filePath;
        return filePath;
      }),
    ).resolves.toMatch(/better-content-media-/);
    await expect(access(temporaryPath)).rejects.toBeDefined();
    await expect(
      withInspectionTempFile(chunks("123"), 5, async () => {
        throw new Error("inspection failed");
      }),
    ).rejects.toThrow("inspection failed");

    async function* chunks(...values: string[]) {
      for (const value of values) yield Buffer.from(value);
    }
  });

  it("uses normalized composition and does not let a browser MIME hint enter inspection", async () => {
    const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    await withFile(bytes, async (filePath) => {
      await expect(
        new DefaultMediaInspector().inspect({
          filePath,
          declaredMediaType: "IMAGE",
          originalFilename: "still.png",
        }),
      ).resolves.toMatchObject({ mediaFormat: "PNG" });
    });
  });
});
