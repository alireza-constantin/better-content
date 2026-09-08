import "server-only";

import { createReadStream } from "node:fs";

import { db } from "@/db";
import { logger } from "@/lib/logging/server";
import { assetByteLimits } from "../domain/upload-contracts";
import { type AssetMediaType } from "../domain/asset-contracts";
import {
  assertMediaExtension,
  assertMediaType,
  MediaInspectionError,
  mediaMimeType,
  type MediaInspectionResult,
} from "../domain/media-inspection-contracts";
import { AssetStorageError, type AssetStorage } from "../infrastructure/asset-storage";
import { assertStagingStorageKey, type PermanentStorageKey } from "../infrastructure/storage-keys";
import { withInspectionTempFile } from "../infrastructure/temporary-media-file";
import {
  findAssetByIdForUpdate,
  markAssetProcessing,
  markAssetReady,
  type AssetRow,
} from "./asset-repository";
import { reserveAssetPermanentStorageKey } from "./asset-job-repository";
import type { MediaInspector } from "./media-inspector";

export type ManagedStagingAssetContext = Readonly<{
  assetId: string;
  heartbeat?: () => Promise<boolean>;
}>;

export class ManagedStagingProcessingError extends Error {
  constructor(
    readonly failureCode:
      | "MEDIA_TOO_LARGE"
      | "MEDIA_LIMIT_EXCEEDED"
      | "MEDIA_TYPE_MISMATCH"
      | "UNSUPPORTED_MEDIA"
      | "INVALID_MEDIA"
      | "PROCESSING_UNAVAILABLE",
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "ManagedStagingProcessingError";
  }
}

type ProcessorLogger = Pick<typeof logger, "warn">;

export type ManagedStagingProcessorDependencies = Readonly<{
  database?: typeof db;
  storage: AssetStorage;
  inspector: MediaInspector;
  clock?: () => Date;
  logger?: ProcessorLogger;
}>;

/**
 * The source-neutral boundary after acquisition has produced a managed staging
 * object. It deliberately accepts only Asset identity, never browser or URL
 * state, so future acquisition paths can reuse this exact pipeline.
 */
export function createManagedStagingProcessor(
  dependencies: ManagedStagingProcessorDependencies,
): Readonly<{ process(context: ManagedStagingAssetContext): Promise<void> }> {
  const database = dependencies.database ?? db;
  const clock = dependencies.clock ?? (() => new Date());
  const serviceLogger = dependencies.logger;

  async function process(context: ManagedStagingAssetContext): Promise<void> {
    const asset = await prepareAsset(context.assetId);
    if (!asset) return;
    await ensureLease(context.heartbeat);
    if (!asset.stagingKey || asset.declaredByteSize === null)
      throw terminal("INVALID_MEDIA", "Managed staging metadata is incomplete.");

    const stagingKey = assertStagingStorageKey(asset.stagingKey);
    const { staging, permanentKey } = await inspectAndPromote(asset, stagingKey, context.heartbeat);

    const permanentMetadata = await dependencies.storage
      .getObjectMetadata(permanentKey)
      .catch((error) => {
        throw storageFailure(error, true);
      });
    if (!permanentMetadata) throw retryable("Permanent managed media is not readable.");

    let permanent: MediaInspectionResult;
    try {
      permanent = await withInspectionTempFile(
        await dependencies.storage.openPermanentRead(permanentKey),
        assetByteLimits[asset.mediaType as AssetMediaType],
        (filePath) =>
          dependencies.inspector.inspect({
            filePath,
            declaredMediaType: asset.mediaType as AssetMediaType,
            originalFilename: asset.originalFilename ?? undefined,
          }),
      );
    } catch (error) {
      throw normalizeProcessingError(error, true);
    }

    if (permanentMetadata.sizeBytes !== permanent.sizeBytes)
      throw retryable("Permanent managed media changed during inspection.");
    try {
      assertInspectionMatches(asset, staging, permanent);
    } catch (error) {
      throw normalizeProcessingError(error, false);
    }
    await ensureLease(context.heartbeat);
    const ready = await database.transaction(async (transaction) => {
      const current = await findAssetByIdForUpdate(transaction, asset.id);
      if (!current) throw terminal("INVALID_MEDIA", "Asset lifecycle record is missing.");
      if (current.status === "READY") return true;
      if (current.status !== "PROCESSING" || current.permanentKey !== permanentKey)
        throw terminal("INVALID_MEDIA", "Asset lifecycle changed during processing.");
      return markAssetReady(transaction, {
        assetId: asset.id,
        permanentKey,
        byteSize: permanent.sizeBytes,
        detectedMimeType: mediaMimeType(permanent.mediaFormat),
        mediaFormat: permanent.mediaFormat,
        width: permanent.width,
        height: permanent.height,
        durationMs: permanent.durationMs,
        codecs: [permanent.videoCodec, permanent.audioCodec].filter(Boolean).join(",") || undefined,
        now: clock(),
      });
    });
    if (!ready) throw retryable("Asset READY transition was not applied.");

    try {
      await dependencies.storage.deleteStagingObject(stagingKey);
    } catch {
      // READY is authoritative. A cleanup outage must not corrupt it; a later
      // bounded reconciliation/cleanup ticket can remove this staging object.
      serviceLogger?.warn("assets.staging_cleanup_deferred", {
        module: "assets",
        operation: "managed-staging-processor",
        entityId: asset.id,
      });
    }
  }

  async function ensureLease(heartbeat: ManagedStagingAssetContext["heartbeat"]): Promise<void> {
    if (heartbeat && !(await heartbeat())) throw retryable("Asset processing lease was lost.");
  }

  async function prepareAsset(assetId: string): Promise<AssetRow | undefined> {
    return database.transaction(async (transaction) => {
      const asset = await findAssetByIdForUpdate(transaction, assetId);
      if (!asset) throw terminal("INVALID_MEDIA", "Asset lifecycle record is missing.");
      if (asset.status === "READY" || asset.status === "FAILED" || asset.status === "DELETING")
        return undefined;
      if (asset.status === "PENDING") {
        const processing = await markAssetProcessing(transaction, asset.id, clock());
        if (!processing) throw retryable("Asset could not enter processing.");
        return processing;
      }
      if (asset.status !== "PROCESSING") throw retryable("Asset lifecycle is unavailable.");
      return asset;
    });
  }

  async function inspectAndPromote(
    asset: AssetRow,
    stagingKey: ReturnType<typeof assertStagingStorageKey>,
    heartbeat: ManagedStagingAssetContext["heartbeat"],
  ): Promise<{ staging: MediaInspectionResult; permanentKey: PermanentStorageKey }> {
    const metadata = await dependencies.storage.getObjectMetadata(stagingKey).catch((error) => {
      throw storageFailure(error, false);
    });
    if (!metadata) throw terminal("INVALID_MEDIA", "Managed staging media is missing.");
    if (metadata.sizeBytes !== asset.declaredByteSize)
      throw terminal("INVALID_MEDIA", "Managed staging media does not match the declaration.");
    if (metadata.sizeBytes > assetByteLimits[asset.mediaType as AssetMediaType])
      throw terminal("MEDIA_TOO_LARGE", "Managed staging media exceeds the approved limit.");

    try {
      return await withInspectionTempFile(
        await dependencies.storage.openStagingRead(stagingKey),
        assetByteLimits[asset.mediaType as AssetMediaType],
        async (filePath) => {
          const result = await dependencies.inspector.inspect({
            filePath,
            declaredMediaType: asset.mediaType as AssetMediaType,
            originalFilename: asset.originalFilename ?? undefined,
          });
          if (result.sizeBytes !== metadata.sizeBytes)
            throw terminal("INVALID_MEDIA", "Staging media changed during inspection.");
          try {
            assertMediaType(asset.mediaType as AssetMediaType, result.mediaType);
            assertMediaExtension(
              asset.originalFilename ?? undefined,
              asset.mediaType as AssetMediaType,
              result.mediaFormat,
            );
          } catch (error) {
            throw normalizeProcessingError(error, false);
          }
          const permanentKey = await reservePermanentKey(asset.id);
          await ensureLease(heartbeat);
          try {
            await dependencies.storage.putPermanentFromStream(
              permanentKey,
              createReadStream(filePath),
            );
          } catch (error) {
            throw storageFailure(error, true);
          }
          return { staging: result, permanentKey };
        },
      );
    } catch (error) {
      throw normalizeProcessingError(error, false);
    }
  }

  async function reservePermanentKey(assetId: string): Promise<PermanentStorageKey> {
    const key = await database.transaction(async (transaction) => {
      const current = await findAssetByIdForUpdate(transaction, assetId);
      if (!current || current.status !== "PROCESSING")
        throw terminal("INVALID_MEDIA", "Asset is no longer processable.");
      return reserveAssetPermanentStorageKey(transaction, assetId);
    });
    if (!key) throw retryable("Permanent storage ownership could not be reserved.");
    return key;
  }

  return { process };
}

function assertInspectionMatches(
  asset: AssetRow,
  staging: MediaInspectionResult,
  permanent: MediaInspectionResult,
): void {
  assertMediaType(asset.mediaType as AssetMediaType, staging.mediaType);
  assertMediaType(asset.mediaType as AssetMediaType, permanent.mediaType);
  assertMediaExtension(
    asset.originalFilename ?? undefined,
    asset.mediaType as AssetMediaType,
    staging.mediaFormat,
  );
  assertMediaExtension(
    asset.originalFilename ?? undefined,
    asset.mediaType as AssetMediaType,
    permanent.mediaFormat,
  );
  const fields: (keyof MediaInspectionResult)[] = [
    "mediaType",
    "mediaFormat",
    "sizeBytes",
    "width",
    "height",
    "durationMs",
    "videoCodec",
    "audioCodec",
  ];
  for (const field of fields) {
    if (staging[field] !== permanent[field])
      throw terminal("INVALID_MEDIA", "Permanent media metadata does not match staging.");
  }
}

function terminal(
  code: ManagedStagingProcessingError["failureCode"],
  message: string,
): ManagedStagingProcessingError {
  return new ManagedStagingProcessingError(code, false, message);
}

function retryable(message: string): ManagedStagingProcessingError {
  return new ManagedStagingProcessingError("PROCESSING_UNAVAILABLE", true, message);
}

function storageFailure(error: unknown, retry: boolean): ManagedStagingProcessingError {
  if (error instanceof AssetStorageError && error.kind === "NOT_FOUND" && !retry)
    return terminal("INVALID_MEDIA", "Managed staging media is missing.");
  return retryable("Managed storage is temporarily unavailable.");
}

function normalizeProcessingError(
  error: unknown,
  permanent: boolean,
): ManagedStagingProcessingError {
  if (error instanceof ManagedStagingProcessingError) return error;
  if (error instanceof MediaInspectionError) {
    if (error.code === "PROCESSING_UNAVAILABLE")
      return retryable("Media inspection is unavailable.");
    return terminal(error.code, "Media did not pass the approved validation rules.");
  }
  if (error instanceof AssetStorageError) {
    if (!permanent && error.kind === "NOT_FOUND")
      return terminal("INVALID_MEDIA", "Managed staging media is missing.");
    return retryable(
      permanent && error.kind === "NOT_FOUND"
        ? "Permanent managed media is not readable."
        : "Managed storage is temporarily unavailable.",
    );
  }
  return retryable(
    permanent ? "Permanent media inspection is unavailable." : "Media processing is unavailable.",
  );
}
