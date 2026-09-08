import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { assetReferences, assets } from "@/db/schema";
import { db } from "@/db";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import { extractAssetReferences, contentDocumentSchema } from "@/modules/content/domain";
import { contentDrafts, contentVersions, contents } from "@/db/schema";
import { lockWorkspaceForUpdate, requireWorkspaceOwner } from "@/modules/workspace/application";
import { createAssetJob } from "./asset-job-repository";
import { findAssetForUpdate } from "./asset-repository";

const deletionInputSchema = z.object({ workspaceId: z.uuid(), assetId: z.uuid() }).strict();

export type DeleteAssetResult = Readonly<{
  assetId: string;
  status: "DELETING";
  cleanupWorkflowEstablished: true;
}>;

async function canonicalReferenceExists(
  transaction: Pick<typeof db, "select">,
  workspaceId: string,
  assetId: string,
): Promise<boolean> {
  const artifacts = await transaction
    .select({ document: contentDrafts.document })
    .from(contentDrafts)
    .innerJoin(contents, eq(contents.id, contentDrafts.contentId))
    .where(eq(contents.workspaceId, workspaceId));
  const versions = await transaction
    .select({ document: contentVersions.document })
    .from(contentVersions)
    .innerJoin(contents, eq(contents.id, contentVersions.contentId))
    .where(eq(contents.workspaceId, workspaceId));
  return [...artifacts, ...versions].some(({ document }) => {
    const parsed = contentDocumentSchema.safeParse(document);
    return (
      parsed.success &&
      extractAssetReferences(parsed.data).some((reference) => reference.assetId === assetId)
    );
  });
}

/** Explicit, reference-safe deletion request. Storage work intentionally starts after commit. */
export function createAssetDeletionApplicationService(
  dependencies: Readonly<{
    database?: typeof db;
    getAuthenticatedUserId?: () => Promise<string | null>;
    clock?: () => Date;
    logger?: Pick<typeof logger, "info">;
  }> = {},
) {
  const database = dependencies.database ?? db;
  const authenticatedUser =
    dependencies.getAuthenticatedUserId ??
    (async () => (await getServerSession())?.user.id ?? null);
  const clock = dependencies.clock ?? (() => new Date());
  const serviceLogger = dependencies.logger ?? logger;

  return {
    async deleteAsset(input: unknown): Promise<DeleteAssetResult> {
      const userId = await authenticatedUser();
      if (!userId) throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      const parsed = deletionInputSchema.safeParse(input);
      if (!parsed.success)
        throw new ApplicationError("VALIDATION_ERROR", "The Asset deletion request is invalid.");
      const result = await database.transaction(async (transaction) => {
        await lockWorkspaceForUpdate(transaction, parsed.data.workspaceId);
        await requireWorkspaceOwner(userId, parsed.data.workspaceId, transaction);
        const asset = await findAssetForUpdate(transaction, parsed.data);
        if (!asset) throw new ApplicationError("NOT_FOUND", "The Asset was not found.");
        if (asset.status === "DELETING") {
          await createAssetJob(transaction, {
            type: "DELETE_ASSET",
            payload: { assetId: asset.id },
          });
          return asset;
        }
        if (asset.status === "PROCESSING")
          throw new ApplicationError("CONFLICT", "The Asset is still processing.");
        if (asset.status !== "PENDING" && asset.status !== "READY" && asset.status !== "FAILED")
          throw new ApplicationError("CONFLICT", "The Asset cannot be deleted.");

        // The Asset row lock serializes attachment/acceptance writers. Check both
        // the projection and canonical V3 artifacts so projection drift is never
        // permission to destroy referenced media.
        const [projection] = await transaction
          .select({ id: assetReferences.assetId })
          .from(assetReferences)
          .where(
            and(
              eq(assetReferences.workspaceId, asset.workspaceId),
              eq(assetReferences.assetId, asset.id),
            ),
          )
          .limit(1);
        if (
          projection ||
          (await canonicalReferenceExists(transaction, asset.workspaceId, asset.id))
        )
          throw new ApplicationError("ASSET_IN_USE", "The Asset is still referenced by Content.");

        await transaction
          .update(assets)
          .set({
            status: "DELETING",
            deletingFromReady: asset.status === "READY" ? 1 : 0,
            updatedAt: clock(),
          })
          .where(eq(assets.id, asset.id));
        await createAssetJob(transaction, { type: "DELETE_ASSET", payload: { assetId: asset.id } });
        return asset;
      });
      serviceLogger.info("assets.deletion_requested", {
        module: "assets",
        operation: "deleteAsset",
        workspaceId: parsed.data.workspaceId,
        userId,
        entityId: result.id,
      });
      return { assetId: result.id, status: "DELETING", cleanupWorkflowEstablished: true };
    },
  };
}
