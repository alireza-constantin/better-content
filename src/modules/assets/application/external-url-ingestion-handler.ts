import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { assets } from "@/db/schema";
import { logger } from "@/lib/logging/server";
import type { AssetJobHandler } from "./asset-job-runner";
import { findAssetByIdForUpdate, markAssetFailed } from "./asset-repository";
import {
  createManagedStagingProcessor,
  ManagedStagingProcessingError,
} from "./staged-media-processor";
import {
  createControlledRemoteAcquirer,
  RemoteAcquisitionError,
  type ControlledRemoteResolver,
  type ControlledRemoteTransport,
} from "../infrastructure/controlled-remote-acquisition";
import { AssetStorageError, type AssetStorage } from "../infrastructure/asset-storage";
import { assertStagingStorageKey } from "../infrastructure/storage-keys";
import type { MediaInspector } from "./media-inspector";
import type { AssetMediaType } from "../domain/asset-contracts";

export type ExternalUrlIngestionHandlerDependencies = Readonly<{
  database?: typeof db;
  storage: AssetStorage;
  inspector: MediaInspector;
  resolver?: ControlledRemoteResolver;
  transport?: ControlledRemoteTransport;
  clock?: () => Date;
  logger?: Pick<typeof logger, "warn">;
}>;

/** External URL work ends at private staging; Ticket 04's processor owns staging → READY. */
export function createExternalUrlIngestionHandler(
  dependencies: ExternalUrlIngestionHandlerDependencies,
): AssetJobHandler {
  const database = dependencies.database ?? db;
  const clock = dependencies.clock ?? (() => new Date());
  const acquirer = createControlledRemoteAcquirer({
    resolver: dependencies.resolver,
    transport: dependencies.transport,
  });
  const processor = createManagedStagingProcessor(dependencies);

  return async ({ assetId, attempts, maxAttempts, heartbeat }) => {
    const asset = await database.transaction(async (transaction) => {
      const current = await findAssetByIdForUpdate(transaction, assetId);
      if (
        !current ||
        current.status === "READY" ||
        current.status === "FAILED" ||
        current.status === "DELETING"
      )
        return undefined;
      if (current.sourceType !== "EXTERNAL_URL" || !current.sourceUrl || !current.stagingKey) {
        await transaction
          .update(assets)
          .set({ status: "FAILED", failureCode: "INVALID_MEDIA", updatedAt: clock() })
          .where(eq(assets.id, assetId));
        return undefined;
      }
      if (current.status === "PENDING")
        await transaction
          .update(assets)
          .set({ status: "PROCESSING", failureCode: null, updatedAt: clock() })
          .where(eq(assets.id, assetId));
      return current;
    });
    if (!asset) return { kind: "COMPLETED" as const };

    try {
      const stagingKey = assertStagingStorageKey(asset.stagingKey as string);
      // A completed acquisition is a durable managed snapshot; retries inspect it rather than refetch it.
      if (asset.declaredByteSize === null) {
        const remoteBody = await acquirer.acquire(
          asset.sourceUrl as string,
          asset.mediaType as AssetMediaType,
        );
        try {
          await dependencies.storage.deleteStagingObject(stagingKey);
          await dependencies.storage.putStagingFromStream(stagingKey, remoteBody);
          const metadata = await dependencies.storage.getObjectMetadata(stagingKey);
          if (!metadata)
            throw new AssetStorageError("Managed staging is unavailable.", "UNAVAILABLE");
          await database
            .update(assets)
            .set({ declaredByteSize: metadata.sizeBytes, updatedAt: clock() })
            .where(eq(assets.id, asset.id));
        } catch (error) {
          await cleanupStaging(assetId, stagingKey);
          throw error;
        }
      }
      await processor.process({ assetId, heartbeat });
      return { kind: "COMPLETED" as const };
    } catch (error) {
      const failure = normalizeFailure(error);
      const terminalFailure = !failure.retryable || attempts >= maxAttempts;
      if (terminalFailure) {
        await database.transaction(async (transaction) => {
          await markAssetFailed(transaction, {
            assetId,
            failureCode: failure.failureCode,
            now: clock(),
          });
        });
        const current = await database.select().from(assets).where(eq(assets.id, assetId));
        if (current[0]?.stagingKey)
          await cleanupStaging(assetId, assertStagingStorageKey(current[0].stagingKey));
      }
      return {
        kind: "FAILED" as const,
        failureCode: failure.failureCode,
        retryable: !terminalFailure,
      };
    }
  };

  async function cleanupStaging(assetId: string, stagingKey: `staging/${string}`): Promise<void> {
    try {
      await dependencies.storage.deleteStagingObject(stagingKey);
    } catch {
      dependencies.logger?.warn("assets.staging_cleanup_deferred", {
        module: "assets",
        operation: "external-url-ingestion",
        entityId: assetId,
      });
    }
  }
}

function normalizeFailure(error: unknown): Readonly<{
  failureCode:
    | "UNSAFE_MEDIA_URL"
    | "MEDIA_SOURCE_UNAVAILABLE"
    | "MEDIA_TOO_LARGE"
    | "UNSUPPORTED_MEDIA"
    | "MEDIA_LIMIT_EXCEEDED"
    | "MEDIA_TYPE_MISMATCH"
    | "INVALID_MEDIA"
    | "PROCESSING_UNAVAILABLE";
  retryable: boolean;
}> {
  if (error instanceof RemoteAcquisitionError)
    return { failureCode: error.failureCode, retryable: error.retryable };
  if (error instanceof ManagedStagingProcessingError)
    return { failureCode: error.failureCode, retryable: error.retryable };
  if (error instanceof AssetStorageError)
    return { failureCode: "PROCESSING_UNAVAILABLE", retryable: true };
  return { failureCode: "PROCESSING_UNAVAILABLE", retryable: true };
}
