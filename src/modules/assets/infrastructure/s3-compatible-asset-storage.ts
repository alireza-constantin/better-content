import type { Readable } from "node:stream";

import type {
  AssetStorage,
  ManagedStorageObjectPage,
  PrivateReadCapability,
  PrivateReadOptions,
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
 * Narrow normalized transport supplied by the configured S3-compatible
 * provider adapter. It keeps any provider SDK/client out of application code.
 */
export interface S3CompatiblePrivateObjectClient {
  issueStagingPut(key: string, expiresAt: Date, contentLength: number): Promise<{ url: string }>;
  head(key: string): Promise<{ sizeBytes: number } | null>;
  get(key: string): Promise<Readable | null>;
  putStaging(key: string, source: AsyncIterable<Uint8Array>): Promise<void>;
  putIfAbsent(key: string, source: AsyncIterable<Uint8Array>): Promise<void>;
  copyIfAbsent(source: string, destination: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(
    input: Readonly<{ prefix: "staging/" | "permanent/"; cursor?: string | null; limit: number }>,
  ): Promise<
    Readonly<{
      objects: readonly Readonly<{ key: string; sizeBytes: number; lastModified: Date }>[];
      nextCursor: string | null;
    }>
  >;
  issuePrivateRead(
    key: string,
    expiresAt: Date,
    options: PrivateReadOptions,
  ): Promise<{ url: string }>;
}

/** Provider-neutral mapper; concrete SDK configuration remains deployment work. */
export class S3CompatibleAssetStorage implements AssetStorage {
  constructor(private readonly client: S3CompatiblePrivateObjectClient) {}

  async listManagedObjects(
    input: Readonly<{ namespace: "staging" | "permanent"; cursor?: string | null; limit?: number }>,
  ): Promise<ManagedStorageObjectPage> {
    const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
    try {
      const page = await this.client.list({
        prefix: `${input.namespace}/`,
        cursor: input.cursor,
        limit,
      });
      return {
        objects: page.objects.map((object) => {
          const key = assertStorageKey(object.key);
          if (
            !key.startsWith(`${input.namespace}/`) ||
            !Number.isSafeInteger(object.sizeBytes) ||
            object.sizeBytes < 0 ||
            Number.isNaN(object.lastModified.getTime())
          )
            throw new AssetStorageError("Managed object listing is invalid.", "UNAVAILABLE");
          return { ...object, key };
        }),
        nextCursor: page.nextCursor,
      };
    } catch (error) {
      if (error instanceof AssetStorageError) throw error;
      throw new AssetStorageError("Managed storage is unavailable.", "UNAVAILABLE");
    }
  }

  async createStagingPutCapability(
    key: StagingStorageKey,
    expiresAt: Date,
    contentLength: number,
  ): Promise<StagingPutCapability> {
    const validKey = assertStagingStorageKey(key);
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0)
      throw new AssetStorageError("Invalid staging content length.", "UNAVAILABLE");
    try {
      const { url } = await this.client.issueStagingPut(validKey, expiresAt, contentLength);
      return { key: validKey, url, expiresAt, contentLength };
    } catch (error) {
      if (error instanceof AssetStorageError) throw error;
      throw new AssetStorageError("Managed storage is unavailable.", "UNAVAILABLE");
    }
  }

  async getObjectMetadata(
    key: StagingStorageKey | PermanentStorageKey,
  ): Promise<StoredObjectMetadata | null> {
    const validKey = assertStorageKey(key);
    try {
      const metadata = await this.client.head(validKey);
      if (metadata === null) return null;
      if (!Number.isSafeInteger(metadata.sizeBytes) || metadata.sizeBytes <= 0)
        throw new AssetStorageError("Managed object metadata is invalid.", "UNAVAILABLE");
      return metadata;
    } catch (error) {
      if (error instanceof AssetStorageError) throw error;
      throw new AssetStorageError("Managed storage is unavailable.", "UNAVAILABLE");
    }
  }

  async openPermanentRead(key: PermanentStorageKey): Promise<Readable> {
    return this.openRead(assertPermanentStorageKey(key));
  }

  async openStagingRead(key: StagingStorageKey): Promise<Readable> {
    return this.openRead(assertStagingStorageKey(key));
  }

  async putStagingFromStream(
    key: StagingStorageKey,
    source: AsyncIterable<Uint8Array>,
  ): Promise<void> {
    const validKey = assertStagingStorageKey(key);
    try {
      await this.client.putStaging(validKey, source);
    } catch (error) {
      if (error instanceof AssetStorageError) throw error;
      throw new AssetStorageError("Managed storage is unavailable.", "UNAVAILABLE");
    }
  }

  async putPermanentFromStream(
    key: PermanentStorageKey,
    source: AsyncIterable<Uint8Array>,
  ): Promise<void> {
    const validKey = assertPermanentStorageKey(key);
    try {
      await this.client.putIfAbsent(validKey, source);
    } catch (error) {
      if (error instanceof AssetStorageError) throw error;
      throw new AssetStorageError("Managed storage is unavailable.", "UNAVAILABLE");
    }
  }

  private async openRead(validKey: string): Promise<Readable> {
    try {
      const stream = await this.client.get(validKey);
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
    const source = assertStagingStorageKey(input.source);
    const destination = assertPermanentStorageKey(input.destination);
    try {
      await this.client.copyIfAbsent(source, destination);
    } catch (error) {
      if (error instanceof AssetStorageError) throw error;
      throw new AssetStorageError("Managed storage is unavailable.", "UNAVAILABLE");
    }
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
    options: PrivateReadOptions,
  ): Promise<PrivateReadCapability> {
    const validKey = assertPermanentStorageKey(key);
    try {
      return {
        url: (await this.client.issuePrivateRead(validKey, expiresAt, options)).url,
        expiresAt,
      };
    } catch (error) {
      if (error instanceof AssetStorageError) throw error;
      throw new AssetStorageError("Managed storage is unavailable.", "UNAVAILABLE");
    }
  }

  private async delete(key: StagingStorageKey | PermanentStorageKey): Promise<void> {
    try {
      await this.client.delete(key);
    } catch (error) {
      if (error instanceof AssetStorageError) throw error;
      throw new AssetStorageError("Managed storage is unavailable.", "UNAVAILABLE");
    }
  }
}
