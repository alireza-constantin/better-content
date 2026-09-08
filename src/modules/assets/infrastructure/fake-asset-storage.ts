import { Readable } from "node:stream";

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

type FailureOperation = "metadata" | "read" | "copy" | "delete" | "capability" | "put";

/** Deterministic in-memory contract adapter; not an S3 simulation. */
export class FakeAssetStorage implements AssetStorage {
  readonly operations: string[] = [];
  private readonly objects = new Map<string, Buffer>();
  private readonly failures = new Map<FailureOperation, Error>();
  private capabilitySequence = 0;

  putStagingObject(key: StagingStorageKey, bytes: Uint8Array): void {
    this.objects.set(assertStagingStorageKey(key), Buffer.from(bytes));
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
    const validKey = assertStorageKey(key);
    this.throwFailure("metadata");
    this.operations.push(`metadata:${validKey}`);
    const bytes = this.objects.get(validKey);
    return bytes ? { sizeBytes: bytes.byteLength } : null;
  }

  async createStagingPutCapability(
    key: StagingStorageKey,
    expiresAt: Date,
    contentLength: number,
  ): Promise<StagingPutCapability> {
    const validKey = assertStagingStorageKey(key);
    this.throwFailure("put");
    this.operations.push(`put-capability:${validKey}:${contentLength}`);
    return {
      key: validKey,
      url: `fake://staging-put/${validKey.slice("staging/".length)}`,
      expiresAt,
      contentLength,
    };
  }

  async openPermanentRead(key: PermanentStorageKey): Promise<Readable> {
    return this.openRead(assertPermanentStorageKey(key));
  }

  async openStagingRead(key: StagingStorageKey): Promise<Readable> {
    return this.openRead(assertStagingStorageKey(key));
  }

  async putPermanentFromStream(
    key: PermanentStorageKey,
    source: AsyncIterable<Uint8Array>,
  ): Promise<void> {
    const validKey = assertPermanentStorageKey(key);
    this.throwFailure("copy");
    this.operations.push(`put:${validKey}`);
    if (this.objects.has(validKey)) return;
    const chunks: Buffer[] = [];
    for await (const chunk of source) chunks.push(Buffer.from(chunk));
    this.objects.set(validKey, Buffer.concat(chunks));
  }

  private async openRead(validKey: string): Promise<Readable> {
    this.throwFailure("read");
    this.operations.push(`read:${validKey}`);
    const bytes = this.objects.get(validKey);
    if (!bytes) throw new AssetStorageError("Private object is missing.", "NOT_FOUND");
    return Readable.from(bytes);
  }

  async copyStagingToPermanent(
    input: Readonly<{ source: StagingStorageKey; destination: PermanentStorageKey }>,
  ): Promise<void> {
    const sourceKey = assertStagingStorageKey(input.source);
    const destinationKey = assertPermanentStorageKey(input.destination);
    this.throwFailure("copy");
    this.operations.push(`copy:${sourceKey}:${destinationKey}`);
    const source = this.objects.get(sourceKey);
    if (!source) throw new AssetStorageError("Private object is missing.", "NOT_FOUND");
    if (!this.objects.has(destinationKey)) this.objects.set(destinationKey, Buffer.from(source));
  }

  async deleteStagingObject(key: StagingStorageKey): Promise<void> {
    await this.delete(assertStagingStorageKey(key));
  }

  async deletePermanentObject(key: PermanentStorageKey): Promise<void> {
    await this.delete(assertPermanentStorageKey(key));
  }

  async createPrivateReadCapability(
    key: PermanentStorageKey,
    expiresAt: Date,
  ): Promise<PrivateReadCapability> {
    const validKey = assertPermanentStorageKey(key);
    this.throwFailure("capability");
    if (!this.objects.has(validKey))
      throw new AssetStorageError("Private object is missing.", "NOT_FOUND");
    this.operations.push(`capability:${validKey}`);
    this.capabilitySequence += 1;
    return { url: `fake://private-read/${validKey.slice("permanent/".length)}`, expiresAt };
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
