import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { assetReferences, assets } from "@/db/schema";
import type { AssetDatabase } from "./asset-repository";

export type AssetLibraryDatabase = Pick<AssetDatabase, "select">;

export type AssetLibraryQuery = Readonly<{
  workspaceId: string;
  page: number;
  search: string;
  mediaType: "IMAGE" | "VIDEO" | "AUDIO" | null;
  mediaTypes?: readonly ("IMAGE" | "VIDEO" | "AUDIO")[];
  assetIds?: readonly string[];
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED" | "DELETING" | null;
}>;

export const assetLibraryPageSize = 24;

export function escapedAssetLibrarySubstring(value: string): string {
  return `%${value.replace(/[\\%_]/gu, "\\$&")}%`;
}

/** Bounded Workspace-only query with a presentation-only projection. */
export async function listAssetLibraryRecords(
  database: AssetLibraryDatabase,
  query: AssetLibraryQuery,
) {
  const conditions = [eq(assets.workspaceId, query.workspaceId)];
  if (query.assetIds?.length) conditions.push(inArray(assets.id, query.assetIds));
  if (query.mediaTypes?.length) conditions.push(inArray(assets.mediaType, query.mediaTypes));
  else if (query.mediaType) conditions.push(eq(assets.mediaType, query.mediaType));
  if (query.status) conditions.push(eq(assets.status, query.status));
  if (query.search) {
    const pattern = escapedAssetLibrarySubstring(query.search);
    conditions.push(
      sql`(
        lower(${assets.displayName}) like lower(${pattern}) escape '\\'
        or (
          ${assets.sourceType} = 'UPLOAD'
          and lower(coalesce(${assets.originalFilename}, '')) like lower(${pattern}) escape '\\'
        )
      )`,
    );
  }
  const referenceCount = sql<number>`(
    select count(distinct ${assetReferences.contentId})::int
    from ${assetReferences}
    where ${assetReferences.workspaceId} = ${assets.workspaceId}
      and ${assetReferences.assetId} = ${assets.id}
  )`.as("reference_count");
  return database
    .select({
      asset: {
        id: assets.id,
        mediaType: assets.mediaType,
        sourceType: assets.sourceType,
        status: assets.status,
        displayName: assets.displayName,
        sourceHost: assets.sourceHost,
        byteSize: assets.byteSize,
        width: assets.width,
        height: assets.height,
        durationMs: assets.durationMs,
        mediaFormat: assets.mediaFormat,
        failureCode: assets.failureCode,
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
      },
      referenceCount,
    })
    .from(assets)
    .where(and(...conditions))
    .orderBy(desc(assets.createdAt), desc(assets.id))
    .limit(assetLibraryPageSize + 1)
    .offset((query.page - 1) * assetLibraryPageSize);
}
