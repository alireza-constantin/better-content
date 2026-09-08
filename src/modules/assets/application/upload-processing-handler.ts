import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { logger } from "@/lib/logging/server";
import type { AssetJobHandler } from "./asset-job-runner";
import { findAssetByIdForUpdate, markAssetFailed } from "./asset-repository";
import { createUploadApplicationService } from "./upload-service";
import {
  createManagedStagingProcessor,
  ManagedStagingProcessingError,
} from "./staged-media-processor";
import type { AssetStorage } from "../infrastructure/asset-storage";
import type { MediaInspector } from "./media-inspector";

export type UploadProcessingHandlerDependencies = Readonly<{
  database?: typeof db;
  storage: AssetStorage;
  inspector: MediaInspector;
  clock?: () => Date;
  logger?: Pick<typeof logger, "warn">;
}>;

/** Upload-specific code stops at the shared managed-staging processor call. */
export function createUploadProcessingHandler(
  dependencies: UploadProcessingHandlerDependencies,
): AssetJobHandler {
  const database = dependencies.database ?? db;
  const clock = dependencies.clock ?? (() => new Date());
  const processor = createManagedStagingProcessor(dependencies);

  return async ({ assetId, attempts, maxAttempts, heartbeat }) => {
    const active = await database.transaction(async (transaction) => {
      const asset = await findAssetByIdForUpdate(transaction, assetId);
      if (
        !asset ||
        asset.status === "READY" ||
        asset.status === "FAILED" ||
        asset.status === "DELETING"
      )
        return false;
      if (asset.sourceType !== "UPLOAD") {
        await transaction
          .update(assets)
          .set({ status: "FAILED", failureCode: "INVALID_MEDIA", updatedAt: clock() })
          .where(eq(assets.id, assetId));
        return false;
      }
      if (asset.status === "PENDING") {
        await transaction
          .update(assets)
          .set({ status: "PROCESSING", updatedAt: clock(), failureCode: null })
          .where(eq(assets.id, assetId));
      }
      return true;
    });
    if (!active) return { kind: "COMPLETED" as const };

    try {
      await processor.process({ assetId, heartbeat });
      return { kind: "COMPLETED" as const };
    } catch (error) {
      const failure =
        error instanceof ManagedStagingProcessingError
          ? error
          : new ManagedStagingProcessingError(
              "PROCESSING_UNAVAILABLE",
              true,
              "Media processing is temporarily unavailable.",
            );
      const terminalFailure = !failure.retryable || attempts >= maxAttempts;
      if (terminalFailure) {
        await database.transaction(async (transaction) => {
          await markAssetFailed(transaction, {
            assetId,
            failureCode: failure.failureCode,
            now: clock(),
          });
        });
        await cleanupAfterTerminalFailure(assetId);
      }
      return {
        kind: "FAILED" as const,
        failureCode: failure.failureCode,
        retryable: !terminalFailure,
      };
    }
  };

  async function cleanupAfterTerminalFailure(assetId: string): Promise<void> {
    const asset = await database.select().from(assets).where(eq(assets.id, assetId));
    const stagingKey = asset[0]?.stagingKey;
    if (!stagingKey) return;
    try {
      await dependencies.storage.deleteStagingObject(stagingKey as `staging/${string}`);
    } catch {
      dependencies.logger?.warn("assets.staging_cleanup_deferred", {
        module: "assets",
        operation: "upload-processing-handler",
        entityId: assetId,
      });
    }
  }
}

/** Internal scheduled cleanup seam; it cannot revive a finalized upload. */
export function createUploadExpirationHandler(
  dependencies: Pick<
    UploadProcessingHandlerDependencies,
    "database" | "storage" | "clock" | "logger"
  >,
): AssetJobHandler {
  const { expireUnfinalizedUpload } = createUploadApplicationService({
    storage: dependencies.storage,
    database: dependencies.database,
    clock: dependencies.clock,
    logger: {
      info: () => undefined,
      warn: dependencies.logger?.warn ?? (() => undefined),
    },
    getAuthenticatedUserId: async () => "internal-asset-runner",
  });
  return async ({ assetId }) => {
    await expireUnfinalizedUpload(assetId);
    return { kind: "COMPLETED" as const };
  };
}
