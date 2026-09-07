import type { Readable } from "node:stream";

import type { PermanentStorageKey, StagingStorageKey } from "./storage-keys";

export type StoredObjectMetadata = Readonly<{ sizeBytes: number }>;
export type PrivateReadCapability = Readonly<{ token: string; expiresAt: Date }>;

/**
 * Private object boundary. It intentionally has no list operation and never
 * exposes provider SDK types, bucket locations, or public object URLs.
 */
export interface AssetStorage {
  getObjectMetadata(
    key: StagingStorageKey | PermanentStorageKey,
  ): Promise<StoredObjectMetadata | null>;
  openPermanentRead(key: PermanentStorageKey): Promise<Readable>;
  copyStagingToPermanent(
    input: Readonly<{ source: StagingStorageKey; destination: PermanentStorageKey }>,
  ): Promise<void>;
  deleteStagingObject(key: StagingStorageKey): Promise<void>;
  deletePermanentObject(key: PermanentStorageKey): Promise<void>;
  createPrivateReadCapability(
    key: PermanentStorageKey,
    expiresAt: Date,
  ): Promise<PrivateReadCapability>;
}

export class AssetStorageError extends Error {
  constructor(
    message: string,
    readonly kind: "NOT_FOUND" | "UNAVAILABLE",
  ) {
    super(message);
    this.name = "AssetStorageError";
  }
}
