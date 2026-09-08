import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { MediaInspectionError } from "../domain/media-inspection-contracts";

/** Copies one bounded media stream to an application-generated private path. */
export async function withInspectionTempFile<T>(
  source: AsyncIterable<Uint8Array>,
  maxBytes: number,
  inspect: (filePath: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "better-content-media-"));
  const filePath = join(directory, "input");
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        callback(new MediaInspectionError("MEDIA_LIMIT_EXCEEDED", "Media byte limit exceeded."));
        return;
      }
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.from(source),
      limiter,
      createWriteStream(filePath, { flags: "wx", mode: 0o600 }),
    );
    return await inspect(filePath);
  } finally {
    await removePrivateTempDirectory(directory);
  }
}

async function removePrivateTempDirectory(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
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
