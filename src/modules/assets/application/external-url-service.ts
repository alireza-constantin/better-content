import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { assetAdmissionEvents, assets } from "@/db/schema";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import { lockWorkspaceForUpdate, requireWorkspaceOwner } from "@/modules/workspace/application";
import {
  normalizeExternalMediaUrlInput,
  type ExternalMediaUrlInput,
} from "../domain/external-url-contracts";
import { createStagingStorageKey } from "../infrastructure/storage-keys";
import { countActiveAssetWorkflows, countRecentAssetAdmissionEvents } from "./asset-repository";
import { createAssetJob } from "./asset-job-repository";

export type ExternalUrlApplicationServiceDependencies = Readonly<{
  database?: typeof db;
  getAuthenticatedUserId?: () => Promise<string | null>;
  clock?: () => Date;
  createStagingKey?: typeof createStagingStorageKey;
  logger?: Pick<typeof logger, "info">;
}>;

export type CreateExternalUrlAssetResult = Readonly<{
  assetId: string;
  status: "PENDING";
  sourceType: "EXTERNAL_URL";
  mediaType: ExternalMediaUrlInput["mediaType"];
  sourceHost: string;
}>;

export function createExternalUrlApplicationService(
  dependencies: ExternalUrlApplicationServiceDependencies = {},
): Readonly<{ createExternalUrlAsset(input: unknown): Promise<CreateExternalUrlAssetResult> }> {
  const database = dependencies.database ?? db;
  const getAuthenticatedUserId =
    dependencies.getAuthenticatedUserId ??
    (async () => (await getServerSession())?.user.id ?? null);
  const clock = dependencies.clock ?? (() => new Date());
  const createStagingKey = dependencies.createStagingKey ?? createStagingStorageKey;
  const serviceLogger = dependencies.logger ?? logger;

  return {
    async createExternalUrlAsset(input) {
      const userId = await getAuthenticatedUserId();
      if (!userId) throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      let parsed;
      try {
        parsed = normalizeExternalMediaUrlInput(input);
      } catch {
        throw new ApplicationError("VALIDATION_ERROR", "The media link is invalid.");
      }
      await requireWorkspaceOwner(userId, parsed.workspaceId, database);
      const asset = await database.transaction(async (transaction) => {
        await lockWorkspaceForUpdate(transaction, parsed.workspaceId);
        await requireWorkspaceOwner(userId, parsed.workspaceId, transaction);
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
        );
        const now = clock();
        const since = new Date(now.getTime() - 60 * 60_000);
        const [userEvents, workspaceEvents, active] = await Promise.all([
          countRecentAssetAdmissionEvents(transaction, { userId, since }),
          countRecentAssetAdmissionEvents(transaction, { workspaceId: parsed.workspaceId, since }),
          countActiveAssetWorkflows(transaction, parsed.workspaceId),
        ]);
        if (userEvents >= 30 || workspaceEvents >= 60 || active >= 5)
          throw new ApplicationError("RATE_LIMITED", "Asset ingestion is temporarily limited.", {
            rateLimitSource: "workspace",
          });
        const [created] = await transaction
          .insert(assets)
          .values({
            workspaceId: parsed.workspaceId,
            createdByUserId: userId,
            mediaType: parsed.mediaType,
            sourceType: "EXTERNAL_URL",
            status: "PENDING",
            displayName: parsed.displayName,
            sourceUrl: parsed.sourceUrl,
            sourceHost: parsed.sourceHost,
            stagingKey: createStagingKey(),
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!created)
          throw new ApplicationError("INTERNAL_ERROR", "The media link was not created.");
        await transaction.insert(assetAdmissionEvents).values({
          workspaceId: parsed.workspaceId,
          userId,
          createdAt: now,
        });
        await createAssetJob(transaction, {
          type: "INGEST_EXTERNAL_URL",
          payload: { assetId: created.id },
        });
        return created;
      });
      serviceLogger.info("assets.external_url.created", {
        module: "assets",
        operation: "createExternalUrlAsset",
        entityId: asset.id,
        userId,
        workspaceId: asset.workspaceId,
      });
      return {
        assetId: asset.id,
        status: "PENDING",
        sourceType: "EXTERNAL_URL",
        mediaType: asset.mediaType as ExternalMediaUrlInput["mediaType"],
        sourceHost: asset.sourceHost as string,
      };
    },
  };
}
