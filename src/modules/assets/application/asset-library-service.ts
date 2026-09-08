import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { assets } from "@/db/schema";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import {
  lockWorkspaceForUpdate,
  requireWorkspaceMembership,
  requireWorkspaceOwner,
} from "@/modules/workspace/application";
import { assetMediaTypeSchema, assetStatusSchema } from "../domain/asset-contracts";
import { codePointLength, isSafeCreatorText } from "../domain/upload-contracts";
import { assetLibraryPageSize, listAssetLibraryRecords } from "./asset-library-repository";

const assetLibraryInputSchema = z
  .object({
    workspaceId: z.uuid(),
    page: z.number().int().min(1).max(100).default(1),
    search: z.string().max(400).default(""),
    mediaType: assetMediaTypeSchema.nullable().optional().default(null),
    mediaTypes: z.array(assetMediaTypeSchema).min(1).max(2).optional(),
    assetIds: z.array(z.uuid()).min(1).max(5).optional(),
    status: assetStatusSchema.nullable().optional().default(null),
  })
  .strict();
const renameAssetInputSchema = z
  .object({ workspaceId: z.uuid(), assetId: z.uuid(), displayName: z.string() })
  .strict();

export type AssetLibraryItemDto = Readonly<{
  id: string;
  mediaType: "IMAGE" | "VIDEO" | "AUDIO";
  sourceType: "UPLOAD" | "EXTERNAL_URL";
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED" | "DELETING";
  displayName: string;
  sourceHost: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  mediaFormat: string | null;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  referenceCount: number;
}>;

export type AssetLibraryDto = Readonly<{
  page: number;
  pageSize: typeof assetLibraryPageSize;
  hasNextPage: boolean;
  search: string;
  mediaType: AssetLibraryItemDto["mediaType"] | null;
  status: AssetLibraryItemDto["status"] | null;
  assets: readonly AssetLibraryItemDto[];
}>;

function safeDisplayName(value: string): string {
  const displayName = value.trim();
  if (
    !isSafeCreatorText(displayName) ||
    codePointLength(displayName) < 1 ||
    codePointLength(displayName) > 200
  )
    throw new ApplicationError("VALIDATION_ERROR", "The Asset name is invalid.");
  return displayName;
}

function toItem(
  record: Awaited<ReturnType<typeof listAssetLibraryRecords>>[number],
): AssetLibraryItemDto {
  const asset = record.asset;
  return {
    id: asset.id,
    mediaType: asset.mediaType as AssetLibraryItemDto["mediaType"],
    sourceType: asset.sourceType as AssetLibraryItemDto["sourceType"],
    status: asset.status as AssetLibraryItemDto["status"],
    displayName: asset.displayName,
    sourceHost: asset.sourceHost,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    mediaFormat: asset.mediaFormat,
    failureCode: asset.failureCode,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    referenceCount: record.referenceCount,
  };
}

export function createAssetLibraryApplicationService(
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
    async getAssetLibrary(input: unknown): Promise<AssetLibraryDto> {
      const userId = await authenticatedUser();
      if (!userId) throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      const parsed = assetLibraryInputSchema.safeParse(input);
      if (!parsed.success)
        throw new ApplicationError("VALIDATION_ERROR", "The Asset Library request is invalid.");
      const search = parsed.data.search.trim();
      if (codePointLength(search) > 200)
        throw new ApplicationError("VALIDATION_ERROR", "The Asset Library request is invalid.");
      await requireWorkspaceMembership(userId, parsed.data.workspaceId, database);
      const records = await listAssetLibraryRecords(database, { ...parsed.data, search });
      const hasNextPage = records.length > assetLibraryPageSize;
      serviceLogger.info("assets.library.loaded", {
        module: "assets",
        operation: "assetLibrary",
        workspaceId: parsed.data.workspaceId,
        userId,
      });
      return {
        page: parsed.data.page,
        pageSize: assetLibraryPageSize,
        hasNextPage,
        search,
        mediaType: parsed.data.mediaType,
        status: parsed.data.status,
        assets: records.slice(0, assetLibraryPageSize).map(toItem),
      };
    },

    async renameAsset(input: unknown): Promise<AssetLibraryItemDto> {
      const userId = await authenticatedUser();
      if (!userId) throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      const parsed = renameAssetInputSchema.safeParse(input);
      if (!parsed.success)
        throw new ApplicationError("VALIDATION_ERROR", "The Asset rename is invalid.");
      const displayName = safeDisplayName(parsed.data.displayName);
      const asset = await database.transaction(async (transaction) => {
        await lockWorkspaceForUpdate(transaction, parsed.data.workspaceId);
        await requireWorkspaceOwner(userId, parsed.data.workspaceId, transaction);
        const [current] = await transaction
          .select()
          .from(assets)
          .where(
            and(
              eq(assets.workspaceId, parsed.data.workspaceId),
              eq(assets.id, parsed.data.assetId),
            ),
          )
          .for("update");
        if (!current) throw new ApplicationError("NOT_FOUND", "The Asset was not found.");
        if (current.status === "DELETING")
          throw new ApplicationError("CONFLICT", "The Asset is deleting.");
        const [updated] = await transaction
          .update(assets)
          .set({ displayName, updatedAt: clock() })
          .where(eq(assets.id, current.id))
          .returning();
        if (!updated)
          throw new ApplicationError("INTERNAL_ERROR", "The Asset could not be renamed.");
        return updated;
      });
      serviceLogger.info("assets.library.renamed", {
        module: "assets",
        operation: "renameAsset",
        workspaceId: parsed.data.workspaceId,
        userId,
        entityId: asset.id,
      });
      return toItem({ asset, referenceCount: 0 });
    },
  };
}

export const getAssetLibrary = (input: unknown) =>
  createAssetLibraryApplicationService().getAssetLibrary(input);
