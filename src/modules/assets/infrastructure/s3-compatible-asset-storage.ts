import type { Readable } from "node:stream";

import type { AssetStorage, PrivateReadCapability, StoredObjectMetadata } from "./asset-storage";
import { AssetStorageError } from "./asset-storage";
import type { PermanentStorageKey, StagingStorageKey } from "./storage-keys";

/**
 * Narrow normalized transport supplied by the configured S3-compatible
 * provider adapter. It keeps any provider SDK/client out of application code.
 */
export interface S3CompatiblePrivateObjectClient {
  head(key: string): Promise<{ sizeBytes: number } | null>;
  get(key: string): Promise<Readable | null>;
  copyIfAbsent(source: string, destination: string): Promise<void>;
  delete(key: string): Promise<void>;
  issuePrivateRead(key: string, expiresAt: Date): Promise<{ token: string }>;
}

/** Provider-neutral mapper; concrete SDK configuration remains deployment work. */
export class S3CompatibleAssetStorage implements AssetStorage {
  constructor(private readonly client: S3CompatiblePrivateObjectClient) {}

  async getObjectMetadata(
    key: StagingStorageKey | PermanentStorageKey,
  ): Promise<StoredObjectMetadata | null> {
    try {
      return await this.client.head(key);
    } catch {
      throw new AssetStorageError("Managed storage is unavailable.", "UNAVAILABLE");
    }
  }

  async openPermanentRead(key: PermanentStorageKey): Promise<Readable> {
    try {
      const stream = await this.client.get(key);
      if (!stream) throw new AssetStorageError("Private object is missing.", "NOT_FOUND");
      return stream;
    } catch (error) {
      if (error instanceof AssetStorageError) throw error;
      throw new AssetStorageError("Managed storage is unavailable.", "UNAVAILABLE");
    }
  }

  async copyStagingToPermanent(
    input: Readonly<{ source: StagingStorageKey; destination: PermanentStorageKey }>,
  ): Promise<void> {
    try {
      await this.client.copyIfAbsent(input.source, input.destination);
    } catch {
      throw new AssetStorageError("Managed storage is unavailable.", "UNAVAILABLE");
    }
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
    try {
      return { ...(await this.client.issuePrivateRead(key, expiresAt)), expiresAt };
    } catch {
      throw new AssetStorageError("Managed storage is unavailable.", "UNAVAILABLE");
    }
  }

  private async delete(key: string): Promise<void> {
    try {
      await this.client.delete(key);
    } catch {
      throw new AssetStorageError("Managed storage is unavailable.", "UNAVAILABLE");
    }
  }
}
