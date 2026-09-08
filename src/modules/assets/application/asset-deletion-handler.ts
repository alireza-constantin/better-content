import "server-only";

import { and, eq } from "drizzle-orm";
import { assets, assetReferences } from "@/db/schema";
import { db } from "@/db";
import { logger } from "@/lib/logging/server";
import type { AssetJobHandler } from "./asset-job-runner";
import { AssetStorageError, type AssetStorage } from "../infrastructure/asset-storage";
import { assertPermanentStorageKey, assertStagingStorageKey } from "../infrastructure/storage-keys";

/** Object-first, idempotent cleanup. A missing object is a successful delete. */
export function createAssetDeletionHandler(
  dependencies: Readonly<{
    database?: typeof db;
    storage: AssetStorage;
    logger?: Pick<typeof logger, "info" | "warn">;
  }>,
): AssetJobHandler {
  const database = dependencies.database ?? db;
  const serviceLogger = dependencies.logger ?? logger;
  return async ({ assetId }) => {
    const [asset] = await database.select().from(assets).where(eq(assets.id, assetId));
    if (!asset || asset.status !== "DELETING") return { kind: "COMPLETED" as const };
    try {
      if (asset.stagingKey)
        await deleteMissingIsSuccess(() =>
          dependencies.storage.deleteStagingObject(assertStagingStorageKey(asset.stagingKey!)),
        );
      if (asset.permanentKey) {
        const exists = await dependencies.storage.getObjectMetadata(
          assertPermanentStorageKey(asset.permanentKey),
        );
        if (!exists && asset.deletingFromReady === 1)
          serviceLogger.warn("assets.ready_object_missing", {
            module: "assets",
            operation: "deleteCleanup",
            entityId: asset.id,
          });
        await deleteMissingIsSuccess(() =>
          dependencies.storage.deletePermanentObject(
            assertPermanentStorageKey(asset.permanentKey!),
          ),
        );
      }
      await database.transaction(async (transaction) => {
        const [current] = await transaction
          .select()
          .from(assets)
          .where(eq(assets.id, assetId))
          .for("update");
        if (!current || current.status !== "DELETING") return;
        const [reference] = await transaction
          .select({ id: assetReferences.assetId })
          .from(assetReferences)
          .where(
            and(
              eq(assetReferences.workspaceId, current.workspaceId),
              eq(assetReferences.assetId, current.id),
            ),
          )
          .limit(1);
        if (reference) return;
        await transaction.delete(assets).where(eq(assets.id, current.id));
      });
      serviceLogger.info("assets.deletion_cleaned", {
        module: "assets",
        operation: "deleteCleanup",
        entityId: assetId,
      });
      return { kind: "COMPLETED" as const };
    } catch {
      serviceLogger.warn("assets.deletion_cleanup_deferred", {
        module: "assets",
        operation: "deleteCleanup",
        entityId: assetId,
      });
      return {
        kind: "FAILED" as const,
        failureCode: "PROCESSING_UNAVAILABLE" as const,
        retryable: true,
      };
    }
  };
}

async function deleteMissingIsSuccess(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (!(error instanceof AssetStorageError) || error.kind !== "NOT_FOUND") throw error;
  }
}
