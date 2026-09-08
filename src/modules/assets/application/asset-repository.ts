import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { assetAdmissionEvents, assetJobs, assets } from "@/db/schema";

export type AssetDatabase = typeof db;
export type AssetRow = typeof assets.$inferSelect;

export async function findAsset(
  database: Pick<typeof db, "select">,
  input: Readonly<{ workspaceId?: string; assetId: string }>,
): Promise<AssetRow | undefined> {
  const conditions = [eq(assets.id, input.assetId)];
  if (input.workspaceId) conditions.push(eq(assets.workspaceId, input.workspaceId));
  return (
    await database
      .select()
      .from(assets)
      .where(and(...conditions))
  )[0];
}

export async function findAssetForUpdate(
  database: Pick<typeof db, "select">,
  input: Readonly<{ workspaceId: string; assetId: string }>,
): Promise<AssetRow | undefined> {
  return (
    await database
      .select()
      .from(assets)
      .where(and(eq(assets.workspaceId, input.workspaceId), eq(assets.id, input.assetId)))
      .for("update")
  )[0];
}

export async function findAssetByIdForUpdate(
  database: Pick<typeof db, "select">,
  assetId: string,
): Promise<AssetRow | undefined> {
  return (await database.select().from(assets).where(eq(assets.id, assetId)).for("update"))[0];
}

export async function hasAssetJob(
  database: Pick<typeof db, "select">,
  type: string,
  assetId: string,
): Promise<boolean> {
  const [job] = await database
    .select({ id: assetJobs.id })
    .from(assetJobs)
    .where(eq(assetJobs.dedupeKey, `${type}:${assetId}`));
  return job !== undefined;
}

export async function countRecentAssetAdmissionEvents(
  database: Pick<typeof db, "select">,
  input: Readonly<{ userId?: string; workspaceId?: string; since: Date }>,
): Promise<number> {
  const conditions = [gte(assetAdmissionEvents.createdAt, input.since)];
  if (input.userId) conditions.push(eq(assetAdmissionEvents.userId, input.userId));
  if (input.workspaceId) conditions.push(eq(assetAdmissionEvents.workspaceId, input.workspaceId));
  const [result] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(assetAdmissionEvents)
    .where(and(...conditions));
  return result?.count ?? 0;
}

export async function countActiveAssetWorkflows(
  database: Pick<typeof db, "select">,
  workspaceId: string,
): Promise<number> {
  const [result] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(assets)
    .where(
      and(eq(assets.workspaceId, workspaceId), inArray(assets.status, ["PENDING", "PROCESSING"])),
    );
  return result?.count ?? 0;
}

export async function markAssetProcessing(
  database: Pick<typeof db, "update">,
  assetId: string,
  now: Date,
): Promise<AssetRow | undefined> {
  const [asset] = await database
    .update(assets)
    .set({ status: "PROCESSING", updatedAt: now, failureCode: null })
    .where(and(eq(assets.id, assetId), eq(assets.status, "PENDING")))
    .returning();
  return asset;
}

export async function markAssetFailed(
  database: Pick<typeof db, "update">,
  input: Readonly<{ assetId: string; failureCode: AssetRow["failureCode"]; now: Date }>,
): Promise<void> {
  await database
    .update(assets)
    .set({ status: "FAILED", failureCode: input.failureCode, updatedAt: input.now })
    .where(and(eq(assets.id, input.assetId), eq(assets.status, "PROCESSING")));
}

export async function markAssetReady(
  database: Pick<typeof db, "update">,
  input: Readonly<{
    assetId: string;
    permanentKey: string;
    byteSize: number;
    detectedMimeType: string;
    mediaFormat: string;
    width?: number;
    height?: number;
    durationMs?: number;
    codecs?: string;
    now: Date;
  }>,
): Promise<boolean> {
  const result = await database
    .update(assets)
    .set({
      status: "READY",
      permanentKey: input.permanentKey,
      byteSize: input.byteSize,
      detectedMimeType: input.detectedMimeType,
      mediaFormat: input.mediaFormat,
      width: input.width,
      height: input.height,
      durationMs: input.durationMs,
      codecs: input.codecs,
      failureCode: null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(assets.id, input.assetId),
        eq(assets.status, "PROCESSING"),
        eq(assets.permanentKey, input.permanentKey),
      ),
    )
    .returning({ id: assets.id });
  return result.length === 1;
}
