import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

import type { AssetStorage, PrivateReadCapability, StoredObjectMetadata } from "./asset-storage";
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

  async putStagingObject(key: StagingStorageKey, bytes: Uint8Array): Promise<void> {
    const path = this.pathFor(assertStagingStorageKey(key));
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, bytes, { flag: "w" });
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
    const path = this.pathFor(assertPermanentStorageKey(key));
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
  ): Promise<PrivateReadCapability> {
    if (!(await this.getObjectMetadata(assertPermanentStorageKey(key))))
      throw new AssetStorageError("Private object is missing.", "NOT_FOUND");
    // A future authorized preview endpoint resolves this opaque capability.
    return { token: randomUUID(), expiresAt };
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
