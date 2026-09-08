import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { link, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

import type {
  AssetStorage,
  PrivateReadCapability,
  StagingPutCapability,
  StoredObjectMetadata,
} from "./asset-storage";
import { AssetStorageError } from "./asset-storage";
import {
  assertPermanentStorageKey,
  assertStagingStorageKey,
  assertStorageKey,
  type PermanentStorageKey,
  type StagingStorageKey,
} from "./storage-keys";

/**
 * Development-only private storage rooted outside public static assets. Key
 * validation happens before path resolution, so creator-controlled traversal
 * never reaches the filesystem.
 */
export class FilesystemAssetStorage implements AssetStorage {
  private readonly root: string;

  constructor(rootDirectory: string) {
    this.root = resolve(rootDirectory);
  }

  async createStagingPutCapability(
    key: StagingStorageKey,
    expiresAt: Date,
    contentLength: number,
  ): Promise<StagingPutCapability> {
    assertStagingStorageKey(key);
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0)
      throw new AssetStorageError("Invalid staging content length.", "UNAVAILABLE");
    return {
      key,
      url: `filesystem://staging-put/${key.slice("staging/".length)}`,
      expiresAt,
      contentLength,
    };
  }

  async putStagingObject(key: StagingStorageKey, bytes: Uint8Array): Promise<void> {
    const path = this.pathFor(assertStagingStorageKey(key));
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, bytes, { flag: "w" });
  }

  async putStagingFromStream(
    key: StagingStorageKey,
    source: AsyncIterable<Uint8Array>,
  ): Promise<void> {
    const destination = this.pathFor(assertStagingStorageKey(key));
    const temporaryDestination = `${destination}.acquire-${randomUUID()}`;
    try {
      await mkdir(resolve(destination, ".."), { recursive: true });
      await pipeline(
        Readable.from(source),
        createWriteStream(temporaryDestination, { flags: "wx", mode: 0o600 }),
      );
      await rm(destination, { force: true });
      await link(temporaryDestination, destination);
    } catch {
      throw new AssetStorageError("Filesystem storage is unavailable.", "UNAVAILABLE");
    } finally {
      await rm(temporaryDestination, { force: true }).catch(() => undefined);
    }
  }

  async getObjectMetadata(
    key: StagingStorageKey | PermanentStorageKey,
  ): Promise<StoredObjectMetadata | null> {
    try {
      const object = await stat(this.pathFor(assertStorageKey(key)));
      return object.isFile() ? { sizeBytes: object.size } : null;
    } catch (error) {
      if (isMissing(error)) return null;
      throw new AssetStorageError("Filesystem storage is unavailable.", "UNAVAILABLE");
    }
  }

  async openPermanentRead(key: PermanentStorageKey) {
    return this.openRead(assertPermanentStorageKey(key));
  }

  async openStagingRead(key: StagingStorageKey) {
    return this.openRead(assertStagingStorageKey(key));
  }

  async putPermanentFromStream(
    key: PermanentStorageKey,
    source: AsyncIterable<Uint8Array>,
  ): Promise<void> {
    const destination = this.pathFor(assertPermanentStorageKey(key));
    const temporaryDestination = `${destination}.upload-${randomUUID()}`;
    try {
      await mkdir(resolve(destination, ".."), { recursive: true });
      await pipeline(
        Readable.from(source),
        createWriteStream(temporaryDestination, { flags: "wx", mode: 0o600 }),
      );
      await link(temporaryDestination, destination);
    } catch (error) {
      if (isAlreadyExists(error)) return;
      throw new AssetStorageError("Filesystem storage is unavailable.", "UNAVAILABLE");
    } finally {
      await rm(temporaryDestination, { force: true }).catch(() => undefined);
    }
  }

  private async openRead(key: string) {
    const path = this.pathFor(key);
    try {
      await stat(path);
      return createReadStream(path);
    } catch (error) {
      if (isMissing(error)) throw new AssetStorageError("Private object is missing.", "NOT_FOUND");
      throw new AssetStorageError("Filesystem storage is unavailable.", "UNAVAILABLE");
    }
  }

  async copyStagingToPermanent(
    input: Readonly<{ source: StagingStorageKey; destination: PermanentStorageKey }>,
  ): Promise<void> {
    const source = this.pathFor(assertStagingStorageKey(input.source));
    const destination = this.pathFor(assertPermanentStorageKey(input.destination));
    try {
      await mkdir(resolve(destination, ".."), { recursive: true });
      await writeFile(destination, await readFile(source), { flag: "wx" });
    } catch (error) {
      if (isAlreadyExists(error)) return;
      if (isMissing(error)) throw new AssetStorageError("Private object is missing.", "NOT_FOUND");
      throw new AssetStorageError("Filesystem storage is unavailable.", "UNAVAILABLE");
    }
  }

  async deleteStagingObject(key: StagingStorageKey): Promise<void> {
    await this.deleteObject(assertStagingStorageKey(key));
  }

  async deletePermanentObject(key: PermanentStorageKey): Promise<void> {
    await this.deleteObject(assertPermanentStorageKey(key));
  }

  async createPrivateReadCapability(
    key: PermanentStorageKey,
    expiresAt: Date,
    options: import("./asset-storage").PrivateReadOptions,
  ): Promise<PrivateReadCapability> {
    void options;
    if (!(await this.getObjectMetadata(assertPermanentStorageKey(key))))
      throw new AssetStorageError("Private object is missing.", "NOT_FOUND");
    // A future authorized preview endpoint resolves this opaque capability.
    return { url: `filesystem://private-read/${randomUUID()}`, expiresAt };
  }

  private pathFor(key: string): string {
    const path = resolve(this.root, key);
    const pathFromRoot = relative(this.root, path);
    if (pathFromRoot === "" || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === "..")
      throw new AssetStorageError("Invalid private storage path.", "UNAVAILABLE");
    return path;
  }

  private async deleteObject(key: string): Promise<void> {
    try {
      await rm(this.pathFor(key), { force: true });
    } catch {
      throw new AssetStorageError("Filesystem storage is unavailable.", "UNAVAILABLE");
    }
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
