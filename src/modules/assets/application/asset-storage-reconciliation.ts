import "server-only";

import { and, eq, gt } from "drizzle-orm";
import { assets } from "@/db/schema";
import { db } from "@/db";
import { logger } from "@/lib/logging/server";
import type { AssetStorage, ManagedObjectNamespace } from "../infrastructure/asset-storage";
import { assertPermanentStorageKey, assertStagingStorageKey } from "../infrastructure/storage-keys";

const safetyWindowMs = 24 * 60 * 60_000;

/** Bounded operational sweep. Listing discovers candidates only; database proof decides deletion. */
export async function reconcileManagedObjectPage(
  input: Readonly<{
    database?: typeof db;
    storage: AssetStorage;
    namespace: ManagedObjectNamespace;
    cursor?: string | null;
    limit?: number;
    now?: Date;
    logger?: Pick<typeof logger, "info" | "warn">;
  }>,
): Promise<Readonly<{ nextCursor: string | null; deleted: number; retained: number }>> {
  const database = input.database ?? db;
  const now = input.now ?? new Date();
  const page = await input.storage.listManagedObjects({
    namespace: input.namespace,
    cursor: input.cursor,
    limit: input.limit,
  });
  let deleted = 0,
    retained = 0;
  for (const object of page.objects) {
    if (object.lastModified.getTime() > now.getTime() - safetyWindowMs) {
      retained += 1;
      continue;
    }
    const column = input.namespace === "staging" ? assets.stagingKey : assets.permanentKey;
    const owned = async () =>
      (await database.select({ id: assets.id }).from(assets).where(eq(column, object.key)).limit(1))
        .length > 0;
    // Recheck immediately before delete; an ownership race always retains.
    if (await owned()) {
      retained += 1;
      continue;
    }
    if (await owned()) {
      retained += 1;
      continue;
    }
    if (input.namespace === "staging")
      await input.storage.deleteStagingObject(assertStagingStorageKey(object.key));
    else await input.storage.deletePermanentObject(assertPermanentStorageKey(object.key));
    deleted += 1;
    input.logger?.info("assets.orphan_deleted", {
      module: "assets",
      operation: "storageReconciliation",
    });
  }
  if (retained)
    input.logger?.warn("assets.orphan_retained", {
      module: "assets",
      operation: "storageReconciliation",
    });
  return { nextCursor: page.nextCursor, deleted, retained };
}

/** Bounded integrity observation; it deliberately never mutates READY state. */
export async function reconcileReadyObjectIntegrity(
  input: Readonly<{
    database?: typeof db;
    storage: AssetStorage;
    afterId?: string;
    limit?: number;
    logger?: Pick<typeof logger, "warn">;
  }>,
): Promise<Readonly<{ processed: number; nextAfterId: string | null }>> {
  const database = input.database ?? db;
  const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
  const rows = await database
    .select()
    .from(assets)
    .where(
      input.afterId
        ? and(eq(assets.status, "READY"), gt(assets.id, input.afterId))
        : eq(assets.status, "READY"),
    )
    .limit(limit);
  for (const asset of rows) {
    if (
      !asset.permanentKey ||
      !(await input.storage.getObjectMetadata(assertPermanentStorageKey(asset.permanentKey)))
    )
      input.logger?.warn("assets.ready_object_missing", {
        module: "assets",
        operation: "readyIntegrity",
        entityId: asset.id,
      });
  }
  return { processed: rows.length, nextAfterId: rows.length === limit ? rows.at(-1)!.id : null };
}
