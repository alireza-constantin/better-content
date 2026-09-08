import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import { FakeAssetStorage } from "../infrastructure/fake-asset-storage";
import { createAssetCapabilityService } from "./asset-capability-service";

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });
const now = new Date("2026-09-08T00:00:00.000Z");
async function seed(status = "READY") {
  const userId = randomUUID(),
    workspaceId = randomUUID(),
    assetId = randomUUID(),
    key = `permanent/${randomUUID()}` as `permanent/${string}`;
  await database
    .insert(schema.user)
    .values({ id: userId, name: "Member", email: `${userId}@test` });
  await database.insert(schema.workspaces).values({ id: workspaceId, name: "Workspace" });
  await database.insert(schema.workspaceMembers).values({ workspaceId, userId, role: "owner" });
  await database.insert(schema.assets).values({
    id: assetId,
    workspaceId,
    createdByUserId: userId,
    mediaType: "IMAGE",
    sourceType: "UPLOAD",
    status,
    displayName: "Cover",
    originalFilename: "cover.jpg",
    declaredByteSize: 1,
    permanentKey: status === "READY" ? key : null,
    byteSize: status === "READY" ? 1 : null,
    detectedMimeType: status === "READY" ? "image/jpeg" : null,
    mediaFormat: status === "READY" ? "JPEG" : null,
  });
  const storage = new FakeAssetStorage();
  if (status === "READY")
    await storage.putPermanentFromStream(
      key,
      (async function* () {
        yield Buffer.from("x");
      })(),
    );
  return { userId, workspaceId, assetId, key, storage };
}
beforeAll(async () => migrate(database, { migrationsFolder: "drizzle" }));
beforeEach(async () =>
  database.execute(
    'TRUNCATE TABLE "asset_admission_events", "asset_jobs", "asset_references", "assets", "workspace_members", "workspaces", "user" CASCADE',
  ),
);
afterAll(async () => pool.end());
describe("Asset capabilities", () => {
  it("reauthorizes READY preview/download, uses permanent identity, and returns exact 900-second expiry", async () => {
    const context = await seed();
    const service = createAssetCapabilityService({
      database,
      storage: context.storage,
      clock: () => now,
      getAuthenticatedUserId: async () => context.userId,
    });
    const preview = await service.issue({
      workspaceId: context.workspaceId,
      assetId: context.assetId,
      operation: "PREVIEW",
    });
    const download = await service.issue({
      workspaceId: context.workspaceId,
      assetId: context.assetId,
      operation: "DOWNLOAD",
    });
    expect(preview.expiresAt.getTime() - now.getTime()).toBe(900_000);
    expect(preview).toMatchObject({
      cacheControl: "private, no-store",
      contentType: "image/jpeg",
      contentDisposition: "inline",
      rangeAllowed: false,
    });
    expect(download.contentDisposition).toContain('filename="Cover.jpg"');
    expect(context.storage.operations.filter((x) => x.startsWith("capability:"))).toHaveLength(2);
  });
  it.each(["PENDING", "PROCESSING", "FAILED", "DELETING"])(
    "rejects non-READY %s",
    async (status) => {
      const context = await seed(status);
      const service = createAssetCapabilityService({
        database,
        storage: context.storage,
        getAuthenticatedUserId: async () => context.userId,
      });
      await expect(
        service.issue({
          workspaceId: context.workspaceId,
          assetId: context.assetId,
          operation: "PREVIEW",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    },
  );
  it("rejects unauthenticated and foreign workspace requests", async () => {
    const context = await seed();
    const service = createAssetCapabilityService({
      database,
      storage: context.storage,
      getAuthenticatedUserId: async () => null,
    });
    await expect(
      service.issue({
        workspaceId: context.workspaceId,
        assetId: context.assetId,
        operation: "PREVIEW",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const [asset] = await database
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.id, context.assetId));
    expect(asset?.sourceUrl).toBeNull();
  });
  it("allows current members but nondiscloses foreign Assets and removed memberships", async () => {
    const context = await seed();
    const memberId = randomUUID();
    const foreignUserId = randomUUID();
    const foreignWorkspaceId = randomUUID();
    await database.insert(schema.user).values([
      { id: memberId, name: "Member", email: `${memberId}@test` },
      { id: foreignUserId, name: "Foreign", email: `${foreignUserId}@test` },
    ]);
    await database.insert(schema.workspaceMembers).values({
      workspaceId: context.workspaceId,
      userId: memberId,
      // Current V1 Workspace persistence accepts owner membership only.
      role: "owner",
    });
    await database
      .insert(schema.workspaces)
      .values({ id: foreignWorkspaceId, name: "Foreign workspace" });
    await database.insert(schema.workspaceMembers).values({
      workspaceId: foreignWorkspaceId,
      userId: foreignUserId,
      role: "owner",
    });

    await expect(
      createAssetCapabilityService({
        database,
        storage: context.storage,
        getAuthenticatedUserId: async () => memberId,
      }).issue({
        workspaceId: context.workspaceId,
        assetId: context.assetId,
        operation: "PREVIEW",
      }),
    ).resolves.toMatchObject({ cacheControl: "private, no-store" });

    await expect(
      createAssetCapabilityService({
        database,
        storage: context.storage,
        getAuthenticatedUserId: async () => foreignUserId,
      }).issue({ workspaceId: foreignWorkspaceId, assetId: context.assetId, operation: "PREVIEW" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await database
      .delete(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, memberId));
    await expect(
      createAssetCapabilityService({
        database,
        storage: context.storage,
        getAuthenticatedUserId: async () => memberId,
      }).issue({
        workspaceId: context.workspaceId,
        assetId: context.assetId,
        operation: "PREVIEW",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
