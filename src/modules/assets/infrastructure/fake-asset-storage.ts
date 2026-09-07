import { Readable } from "node:stream";

import type { AssetStorage, PrivateReadCapability, StoredObjectMetadata } from "./asset-storage";
import { AssetStorageError } from "./asset-storage";
import type { PermanentStorageKey, StagingStorageKey } from "./storage-keys";

type FailureOperation = "metadata" | "read" | "copy" | "delete" | "capability";

/** Deterministic in-memory contract adapter; not an S3 simulation. */
export class FakeAssetStorage implements AssetStorage {
  readonly operations: string[] = [];
  private readonly objects = new Map<string, Buffer>();
  private readonly failures = new Map<FailureOperation, Error>();
  private capabilitySequence = 0;

  putStagingObject(key: StagingStorageKey, bytes: Uint8Array): void {
    this.objects.set(key, Buffer.from(bytes));
  }

  failNext(
    operation: FailureOperation,
    error = new AssetStorageError("Storage unavailable.", "UNAVAILABLE"),
  ): void {
    this.failures.set(operation, error);
  }

  async getObjectMetadata(
    key: StagingStorageKey | PermanentStorageKey,
  ): Promise<StoredObjectMetadata | null> {
    this.throwFailure("metadata");
    this.operations.push(`metadata:${key}`);
    const bytes = this.objects.get(key);
    return bytes ? { sizeBytes: bytes.byteLength } : null;
  }

  async openPermanentRead(key: PermanentStorageKey): Promise<Readable> {
    this.throwFailure("read");
    this.operations.push(`read:${key}`);
    const bytes = this.objects.get(key);
    if (!bytes) throw new AssetStorageError("Private object is missing.", "NOT_FOUND");
    return Readable.from(bytes);
  }

  async copyStagingToPermanent(
    input: Readonly<{ source: StagingStorageKey; destination: PermanentStorageKey }>,
  ): Promise<void> {
    this.throwFailure("copy");
    this.operations.push(`copy:${input.source}:${input.destination}`);
    const source = this.objects.get(input.source);
    if (!source) throw new AssetStorageError("Private object is missing.", "NOT_FOUND");
    if (!this.objects.has(input.destination))
      this.objects.set(input.destination, Buffer.from(source));
  }

  async deleteStagingObject(key: StagingStorageKey): Promise<void> {
    await this.delete(key);
  }

  async deletePermanentObject(key: PermanentStorageKey): Promise<void> {
    await this.delete(key);
  }

  async createPrivateReadCapability(
    key: PermanentStorageKey,
    expiresAt: Date,
  ): Promise<PrivateReadCapability> {
    this.throwFailure("capability");
    if (!this.objects.has(key))
      throw new AssetStorageError("Private object is missing.", "NOT_FOUND");
    this.operations.push(`capability:${key}`);
    this.capabilitySequence += 1;
    return { token: `fake-private-read-${this.capabilitySequence}`, expiresAt };
  }

  private async delete(key: string): Promise<void> {
    this.throwFailure("delete");
    this.operations.push(`delete:${key}`);
    this.objects.delete(key);
  }

  private throwFailure(operation: FailureOperation): void {
    const failure = this.failures.get(operation);
    if (!failure) return;
    this.failures.delete(operation);
    throw failure;
  }
}
