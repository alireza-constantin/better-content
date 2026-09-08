import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { assets, assetAdmissionEvents } from "@/db/schema";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import { lockWorkspaceForUpdate, requireWorkspaceOwner } from "@/modules/workspace/application";
import {
  assetByteLimits,
  isUploadCapabilityEligible,
  normalizeUploadBeginInput,
  type UploadBeginInput,
} from "../domain/upload-contracts";
import { AssetStorageError, type AssetStorage, type StagingPutCapability } from "../infrastructure";
import { assertStagingStorageKey, createStagingStorageKey } from "../infrastructure/storage-keys";
import {
  countActiveAssetWorkflows,
  countRecentAssetAdmissionEvents,
  findAssetForUpdate,
  hasAssetJob,
  type AssetRow,
} from "./asset-repository";
import { createAssetJob } from "./asset-job-repository";

const capabilityLifetimeMs = 4 * 60 * 60_000;
const uploadSessionLifetimeMs = 24 * 60 * 60_000;
const uploadMutationInputSchema = z.object({ workspaceId: z.uuid(), assetId: z.uuid() }).strict();

type UploadServiceLogger = Pick<typeof logger, "info" | "warn">;

export type UploadApplicationServiceDependencies = Readonly<{
  database?: typeof db;
  storage: AssetStorage;
  getAuthenticatedUserId?: () => Promise<string | null>;
  clock?: () => Date;
  logger?: UploadServiceLogger;
  createStagingKey?: typeof createStagingStorageKey;
}>;

export type UploadPutCapability = Readonly<{
  url: string;
  expiresAt: Date;
  contentLength: number;
}>;

export type BeginUploadResult = Readonly<{
  assetId: string;
  status: "PENDING";
  sourceType: "UPLOAD";
  mediaType: UploadBeginInput["mediaType"];
  expectedUploadSizeBytes: number;
  capability: UploadPutCapability;
}>;

export type FinalizeUploadResult = Readonly<{
  assetId: string;
  status: "PENDING";
  workflowEstablished: true;
}>;

async function getServerAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession();
  return session?.user.id ?? null;
}

function requireAuthenticatedUser(userId: string | null): string {
  if (!userId) throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
  return userId;
}

function invalidUpload(): never {
  throw new ApplicationError("VALIDATION_ERROR", "The upload request is invalid.");
}

function parseBeginInput(input: unknown): UploadBeginInput {
  try {
    return normalizeUploadBeginInput(input);
  } catch {
    return invalidUpload();
  }
}

function parseMutationInput(input: unknown): z.infer<typeof uploadMutationInputSchema> {
  const result = uploadMutationInputSchema.safeParse(input);
  if (!result.success) return invalidUpload();
  return result.data;
}

function publicCapability(capability: StagingPutCapability): UploadPutCapability {
  return {
    url: capability.url,
    expiresAt: capability.expiresAt,
    contentLength: capability.contentLength,
  };
}

function storageFailure(error: unknown, missingMessage: string): ApplicationError {
  if (error instanceof AssetStorageError && error.kind === "NOT_FOUND")
    return new ApplicationError("VALIDATION_ERROR", missingMessage);
  return new ApplicationError("INTERNAL_ERROR", "Managed storage is temporarily unavailable.");
}

function workflowConflict(): ApplicationError {
  return new ApplicationError("CONFLICT", "This upload is no longer accepting replacement data.");
}

export function createUploadApplicationService(
  dependencies: UploadApplicationServiceDependencies,
): Readonly<{
  beginUpload(input: unknown): Promise<BeginUploadResult>;
  refreshUploadCapability(input: unknown): Promise<UploadPutCapability>;
  finalizeUpload(input: unknown): Promise<FinalizeUploadResult>;
  expireUnfinalizedUpload(assetId: string): Promise<boolean>;
}> {
  const database = dependencies.database ?? db;
  const getAuthenticatedUserId =
    dependencies.getAuthenticatedUserId ?? getServerAuthenticatedUserId;
  const clock = dependencies.clock ?? (() => new Date());
  const serviceLogger = dependencies.logger ?? logger;
  const createStagingKey = dependencies.createStagingKey ?? createStagingStorageKey;

  async function beginUpload(input: unknown): Promise<BeginUploadResult> {
    const userId = requireAuthenticatedUser(await getAuthenticatedUserId());
    const parsed = parseBeginInput(input);
    await requireWorkspaceOwner(userId, parsed.workspaceId, database);

    const asset = await database.transaction(async (transaction) => {
      await lockWorkspaceForUpdate(transaction, parsed.workspaceId);
      await requireWorkspaceOwner(userId, parsed.workspaceId, transaction);
      // The advisory lock serializes this user's events across their workspaces.
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
      const operationNow = clock();
      const since = new Date(operationNow.getTime() - 60 * 60_000);
      const userEvents = await countRecentAssetAdmissionEvents(transaction, { userId, since });
      const workspaceEvents = await countRecentAssetAdmissionEvents(transaction, {
        workspaceId: parsed.workspaceId,
        since,
      });
      const activeWorkflows = await countActiveAssetWorkflows(transaction, parsed.workspaceId);
      if (userEvents >= 30 || workspaceEvents >= 60 || activeWorkflows >= 5)
        throw new ApplicationError(
          "RATE_LIMITED",
          "Asset upload admission is temporarily limited.",
          {
            rateLimitSource: "workspace",
          },
        );

      const stagingKey = createStagingKey();
      const [created] = await transaction
        .insert(assets)
        .values({
          workspaceId: parsed.workspaceId,
          createdByUserId: userId,
          mediaType: parsed.mediaType,
          sourceType: "UPLOAD",
          status: "PENDING",
          displayName: parsed.displayName,
          originalFilename: parsed.originalFilename,
          declaredByteSize: parsed.expectedUploadSizeBytes,
          declaredMimeType: parsed.browserMimeType,
          stagingKey,
          createdAt: operationNow,
          updatedAt: operationNow,
        })
        .returning();
      if (!created) throw new ApplicationError("INTERNAL_ERROR", "The upload was not created.");
      await transaction.insert(assetAdmissionEvents).values({
        workspaceId: parsed.workspaceId,
        userId,
        createdAt: operationNow,
      });
      await createAssetJob(transaction, {
        type: "EXPIRE_UPLOAD",
        payload: { assetId: created.id },
        scheduledAt: new Date(operationNow.getTime() + uploadSessionLifetimeMs),
      });
      return created;
    });

    const capability = await issueCapability(asset, parsed.expectedUploadSizeBytes);
    serviceLogger.info("assets.upload.begun", {
      module: "assets",
      operation: "beginUpload",
      entityId: asset.id,
      userId,
      workspaceId: asset.workspaceId,
    });
    return {
      assetId: asset.id,
      status: "PENDING",
      sourceType: "UPLOAD",
      mediaType: parsed.mediaType,
      expectedUploadSizeBytes: parsed.expectedUploadSizeBytes,
      capability,
    };
  }

  async function refreshUploadCapability(input: unknown): Promise<UploadPutCapability> {
    const userId = requireAuthenticatedUser(await getAuthenticatedUserId());
    const parsed = parseMutationInput(input);
    await requireWorkspaceOwner(userId, parsed.workspaceId, database);
    const asset = await database.transaction(async (transaction) => {
      await lockWorkspaceForUpdate(transaction, parsed.workspaceId);
      await requireWorkspaceOwner(userId, parsed.workspaceId, transaction);
      const current = await findAssetForUpdate(transaction, parsed);
      if (!current) throw new ApplicationError("NOT_FOUND", "The Asset was not found.");
      const finalized = await hasAssetJob(transaction, "PROCESS_UPLOAD", current.id);
      if (!isUploadCapabilityEligible({ ...current, finalized, now: clock() }))
        throw workflowConflict();
      return current;
    });
    return issueCapability(asset, asset.declaredByteSize ?? invalidUpload());
  }

  async function finalizeUpload(input: unknown): Promise<FinalizeUploadResult> {
    const userId = requireAuthenticatedUser(await getAuthenticatedUserId());
    const parsed = parseMutationInput(input);
    await requireWorkspaceOwner(userId, parsed.workspaceId, database);
    const preliminary = await database.transaction(async (transaction) => {
      await lockWorkspaceForUpdate(transaction, parsed.workspaceId);
      await requireWorkspaceOwner(userId, parsed.workspaceId, transaction);
      const asset = await findAssetForUpdate(transaction, parsed);
      if (!asset) throw new ApplicationError("NOT_FOUND", "The Asset was not found.");
      if (asset.sourceType !== "UPLOAD" || asset.status !== "PENDING") throw workflowConflict();
      if (await hasAssetJob(transaction, "PROCESS_UPLOAD", asset.id))
        return { asset, finalized: true };
      if (clock().getTime() - asset.createdAt.getTime() >= uploadSessionLifetimeMs)
        throw new ApplicationError("CONFLICT", "This upload session has expired.");
      return { asset, finalized: false };
    });
    if (preliminary.finalized)
      return { assetId: preliminary.asset.id, status: "PENDING", workflowEstablished: true };

    const uploadAsset = preliminary.asset;
    if (uploadAsset.stagingKey) {
      let metadata;
      try {
        metadata = await dependencies.storage.getObjectMetadata(
          assertStagingStorageKey(uploadAsset.stagingKey),
        );
      } catch (error) {
        throw storageFailure(error, "The staged upload is unavailable.");
      }
      if (!metadata)
        throw new ApplicationError("VALIDATION_ERROR", "The staged upload is missing.");
      if (metadata.sizeBytes !== uploadAsset.declaredByteSize)
        throw new ApplicationError("VALIDATION_ERROR", "The staged upload size is invalid.");
      if (
        metadata.sizeBytes > assetByteLimits[uploadAsset.mediaType as UploadBeginInput["mediaType"]]
      )
        throw new ApplicationError("VALIDATION_ERROR", "The staged upload is too large.");
    } else {
      throw new ApplicationError("INTERNAL_ERROR", "The upload is missing staging metadata.");
    }

    const result = await database.transaction(async (transaction) => {
      await lockWorkspaceForUpdate(transaction, parsed.workspaceId);
      await requireWorkspaceOwner(userId, parsed.workspaceId, transaction);
      const asset = await findAssetForUpdate(transaction, parsed);
      if (!asset) throw new ApplicationError("NOT_FOUND", "The Asset was not found.");
      if (asset.sourceType !== "UPLOAD" || asset.status !== "PENDING") throw workflowConflict();
      const finalized = await hasAssetJob(transaction, "PROCESS_UPLOAD", asset.id);
      if (finalized) return asset;
      if (clock().getTime() - asset.createdAt.getTime() >= uploadSessionLifetimeMs)
        throw new ApplicationError("CONFLICT", "This upload session has expired.");
      if (!asset.stagingKey || asset.declaredByteSize === null)
        throw new ApplicationError("INTERNAL_ERROR", "The upload is missing staging metadata.");
      await createAssetJob(transaction, { type: "PROCESS_UPLOAD", payload: { assetId: asset.id } });
      return asset;
    });

    serviceLogger.info("assets.upload.finalized", {
      module: "assets",
      operation: "finalizeUpload",
      entityId: result.id,
      userId,
      workspaceId: result.workspaceId,
    });
    return { assetId: result.id, status: "PENDING", workflowEstablished: true };
  }

  async function expireUnfinalizedUpload(assetId: string): Promise<boolean> {
    const firstRead = await database
      .select()
      .from(assets)
      .where(sql`${assets.id} = ${assetId}`);
    const workspaceId = firstRead[0]?.workspaceId;
    if (!workspaceId) return false;
    const expired = await database.transaction(async (transaction) => {
      await lockWorkspaceForUpdate(transaction, workspaceId);
      const asset = await transaction
        .select()
        .from(assets)
        .where(sql`${assets.id} = ${assetId}`)
        .for("update")
        .then((rows) => rows[0]);
      if (!asset || asset.sourceType !== "UPLOAD") return undefined;
      if (asset.status === "FAILED" && asset.failureCode === "UPLOAD_EXPIRED") return asset;
      if (asset.status !== "PENDING") return undefined;
      if (await hasAssetJob(transaction, "PROCESS_UPLOAD", asset.id)) return undefined;
      if (clock().getTime() - asset.createdAt.getTime() < uploadSessionLifetimeMs) return undefined;
      const [failed] = await transaction
        .update(assets)
        .set({ status: "FAILED", failureCode: "UPLOAD_EXPIRED", updatedAt: clock() })
        .where(sql`${assets.id} = ${asset.id}`)
        .returning();
      return failed;
    });
    if (!expired?.stagingKey) return expired !== undefined;
    try {
      await dependencies.storage.deleteStagingObject(assertStagingStorageKey(expired.stagingKey));
    } catch {
      serviceLogger.warn("assets.staging_cleanup_deferred", {
        module: "assets",
        operation: "expireUnfinalizedUpload",
        entityId: assetId,
      });
      throw new ApplicationError("INTERNAL_ERROR", "Upload cleanup is temporarily unavailable.");
    }
    return true;
  }

  async function issueCapability(
    asset: AssetRow,
    contentLength: number,
  ): Promise<UploadPutCapability> {
    if (!asset.stagingKey)
      throw new ApplicationError("INTERNAL_ERROR", "The Asset has no staging key.");
    try {
      return publicCapability(
        await dependencies.storage.createStagingPutCapability(
          assertStagingStorageKey(asset.stagingKey),
          new Date(clock().getTime() + capabilityLifetimeMs),
          contentLength,
        ),
      );
    } catch (error) {
      throw storageFailure(error, "The upload capability could not be created.");
    }
  }

  return { beginUpload, refreshUploadCapability, finalizeUpload, expireUnfinalizedUpload };
}
