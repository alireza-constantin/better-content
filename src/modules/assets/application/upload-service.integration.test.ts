import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import { FakeAssetStorage } from "../infrastructure/fake-asset-storage";
import { createUploadApplicationService } from "./upload-service";

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });
const now = new Date("2026-09-08T00:00:00.000Z");

async function createOwner() {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  await database
    .insert(schema.user)
    .values({ id: userId, name: "Creator", email: `${userId}@test` });
  await database.insert(schema.workspaces).values({ id: workspaceId, name: "Workspace" });
  await database.insert(schema.workspaceMembers).values({ workspaceId, userId, role: "owner" });
  return { userId, workspaceId };
}

function service(userId: string, storage = new FakeAssetStorage()) {
  return {
    storage,
    instance: createUploadApplicationService({
      database,
      storage,
      clock: () => now,
      getAuthenticatedUserId: async () => userId,
      logger: { info: () => undefined, warn: () => undefined },
    }),
  };
}

async function assetFor(assetId: string) {
  const [asset] = await database.select().from(schema.assets).where(eq(schema.assets.id, assetId));
  if (!asset) throw new Error("asset missing");
  return asset;
}

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "drizzle" });
});

beforeEach(async () => {
  await database.execute(
    'TRUNCATE TABLE "asset_admission_events", "asset_jobs", "asset_references", "assets", "workspace_members", "workspaces", "user" CASCADE',
  );
});

afterAll(async () => {
  await pool.end();
});

describe("upload application service", () => {
  it("authorizes Begin, creates one opaque PENDING upload, and scopes a four-hour PUT", async () => {
    const owner = await createOwner();
    const { instance, storage } = service(owner.userId);
    const result = await instance.beginUpload({
      workspaceId: owner.workspaceId,
      mediaType: "IMAGE",
      displayName: "  Cover  ",
      originalFilename: "cover.jpg",
      expectedUploadSizeBytes: 8,
      browserMimeType: "application/octet-stream",
    });
    const asset = await assetFor(result.assetId);
    expect(result.capability).toMatchObject({ contentLength: 8 });
    expect(result.capability.expiresAt.getTime() - now.getTime()).toBe(4 * 60 * 60_000);
    expect(asset).toMatchObject({
      workspaceId: owner.workspaceId,
      createdByUserId: owner.userId,
      sourceType: "UPLOAD",
      status: "PENDING",
      displayName: "Cover",
      originalFilename: "cover.jpg",
      declaredByteSize: 8,
      declaredMimeType: "application/octet-stream",
      permanentKey: null,
    });
    expect(asset.stagingKey).toMatch(/^staging\/[0-9a-f-]{36}$/i);
    expect(storage.operations).toEqual([`put-capability:${asset.stagingKey}:8`]);
  });

  it("does not disclose a foreign workspace and enforces the active-workflow admission limit", async () => {
    const owner = await createOwner();
    const foreign = await createOwner();
    const { instance } = service(owner.userId);
    await expect(
      instance.beginUpload({
        workspaceId: foreign.workspaceId,
        mediaType: "IMAGE",
        displayName: "x",
        originalFilename: "x.jpg",
        expectedUploadSizeBytes: 1,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    for (let i = 0; i < 5; i += 1) {
      await instance.beginUpload({
        workspaceId: owner.workspaceId,
        mediaType: "IMAGE",
        displayName: `x-${i}`,
        originalFilename: `x-${i}.jpg`,
        expectedUploadSizeBytes: 1,
      });
    }
    await expect(
      instance.beginUpload({
        workspaceId: owner.workspaceId,
        mediaType: "IMAGE",
        displayName: "sixth",
        originalFilename: "sixth.jpg",
        expectedUploadSizeBytes: 1,
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await database.select().from(schema.assets)).toHaveLength(5);
  });

  it("enforces the user and workspace rolling creation events without creating an Asset on denial", async () => {
    const owner = await createOwner();
    await database.insert(schema.assetAdmissionEvents).values(
      Array.from({ length: 30 }, () => ({
        workspaceId: owner.workspaceId,
        userId: owner.userId,
      })),
    );
    const { instance } = service(owner.userId);
    await expect(
      instance.beginUpload({
        workspaceId: owner.workspaceId,
        mediaType: "IMAGE",
        displayName: "blocked",
        originalFilename: "blocked.jpg",
        expectedUploadSizeBytes: 1,
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await database.select().from(schema.assets)).toHaveLength(0);
    expect(await database.select().from(schema.assetAdmissionEvents)).toHaveLength(30);

    const workspaceOwner = await createOwner();
    await database.insert(schema.assetAdmissionEvents).values(
      Array.from({ length: 60 }, () => ({
        workspaceId: workspaceOwner.workspaceId,
        userId: workspaceOwner.userId,
      })),
    );
    const workspaceService = service(workspaceOwner.userId);
    await expect(
      workspaceService.instance.beginUpload({
        workspaceId: workspaceOwner.workspaceId,
        mediaType: "IMAGE",
        displayName: "workspace-blocked",
        originalFilename: "workspace-blocked.jpg",
        expectedUploadSizeBytes: 1,
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await database.select().from(schema.assets)).toHaveLength(0);
  });

  it("serializes concurrent Begin calls so admission limits cannot be exceeded", async () => {
    const owner = await createOwner();
    const { instance } = service(owner.userId);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        instance.beginUpload({
          workspaceId: owner.workspaceId,
          mediaType: "IMAGE",
          displayName: `concurrent-${i}`,
          originalFilename: `concurrent-${i}.jpg`,
          expectedUploadSizeBytes: 1,
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(5);
    expect(
      results.filter(
        (result) => result.status === "rejected" && result.reason?.code === "RATE_LIMITED",
      ),
    ).toHaveLength(3);
    expect(await database.select().from(schema.assets)).toHaveLength(5);
  });

  it("refreshes the same unfinalized staging capability and stops after Finalize", async () => {
    const owner = await createOwner();
    const { instance, storage } = service(owner.userId);
    const begun = await instance.beginUpload({
      workspaceId: owner.workspaceId,
      mediaType: "AUDIO",
      displayName: "Sound",
      originalFilename: "sound.mp3",
      expectedUploadSizeBytes: 9,
    });
    const asset = await assetFor(begun.assetId);
    const refreshed = await instance.refreshUploadCapability({
      workspaceId: owner.workspaceId,
      assetId: begun.assetId,
    });
    expect(refreshed.contentLength).toBe(9);
    expect(storage.operations[0]).toContain(asset.stagingKey);
    expect(storage.operations[1]).toContain(asset.stagingKey);

    storage.putStagingObject(asset.stagingKey as `staging/${string}`, Buffer.alloc(9));
    await instance.finalizeUpload({ workspaceId: owner.workspaceId, assetId: begun.assetId });
    await expect(
      instance.refreshUploadCapability({ workspaceId: owner.workspaceId, assetId: begun.assetId }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      await database
        .select()
        .from(schema.assetJobs)
        .where(eq(schema.assetJobs.type, "PROCESS_UPLOAD")),
    ).toHaveLength(1);
    expect(await assetFor(begun.assetId)).toMatchObject({ status: "PENDING" });
  });

  it("converges concurrent Finalize calls on one processing workflow", async () => {
    const owner = await createOwner();
    const { instance, storage } = service(owner.userId);
    const begun = await instance.beginUpload({
      workspaceId: owner.workspaceId,
      mediaType: "IMAGE",
      displayName: "concurrent-finalize",
      originalFilename: "concurrent-finalize.jpg",
      expectedUploadSizeBytes: 2,
    });
    const asset = await assetFor(begun.assetId);
    storage.putStagingObject(asset.stagingKey as `staging/${string}`, Buffer.alloc(2));
    const results = await Promise.all([
      instance.finalizeUpload({ workspaceId: owner.workspaceId, assetId: begun.assetId }),
      instance.finalizeUpload({ workspaceId: owner.workspaceId, assetId: begun.assetId }),
    ]);
    expect(results).toHaveLength(2);
    expect(
      await database
        .select()
        .from(schema.assetJobs)
        .where(eq(schema.assetJobs.type, "PROCESS_UPLOAD")),
    ).toHaveLength(1);
    expect(await assetFor(begun.assetId)).toMatchObject({ status: "PENDING" });
  });

  it("finalizes idempotently, rejects missing or mismatched staging, and does no inline processing", async () => {
    const owner = await createOwner();
    const { instance, storage } = service(owner.userId);
    const missing = await instance.beginUpload({
      workspaceId: owner.workspaceId,
      mediaType: "IMAGE",
      displayName: "missing",
      originalFilename: "missing.jpg",
      expectedUploadSizeBytes: 4,
    });
    await expect(
      instance.finalizeUpload({ workspaceId: owner.workspaceId, assetId: missing.assetId }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const valid = await instance.beginUpload({
      workspaceId: owner.workspaceId,
      mediaType: "IMAGE",
      displayName: "valid",
      originalFilename: "valid.jpg",
      expectedUploadSizeBytes: 4,
    });
    const asset = await assetFor(valid.assetId);
    storage.putStagingObject(asset.stagingKey as `staging/${string}`, Buffer.alloc(4));
    await instance.finalizeUpload({ workspaceId: owner.workspaceId, assetId: valid.assetId });
    const before = storage.operations.length;
    const repeated = await instance.finalizeUpload({
      workspaceId: owner.workspaceId,
      assetId: valid.assetId,
    });
    expect(repeated).toEqual({
      assetId: valid.assetId,
      status: "PENDING",
      workflowEstablished: true,
    });
    expect(storage.operations.length).toBe(before);
    expect(
      await database
        .select()
        .from(schema.assetJobs)
        .where(eq(schema.assetJobs.type, "PROCESS_UPLOAD")),
    ).toHaveLength(1);

    const mismatched = await instance.beginUpload({
      workspaceId: owner.workspaceId,
      mediaType: "IMAGE",
      displayName: "mismatched",
      originalFilename: "mismatched.jpg",
      expectedUploadSizeBytes: 4,
    });
    const mismatchedAsset = await assetFor(mismatched.assetId);
    storage.putStagingObject(mismatchedAsset.stagingKey as `staging/${string}`, Buffer.alloc(3));
    await expect(
      instance.finalizeUpload({ workspaceId: owner.workspaceId, assetId: mismatched.assetId }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("expires only old unfinalized uploads and serializes finalized state", async () => {
    const owner = await createOwner();
    const { instance, storage } = service(owner.userId);
    const unfinalized = await instance.beginUpload({
      workspaceId: owner.workspaceId,
      mediaType: "IMAGE",
      displayName: "old",
      originalFilename: "old.jpg",
      expectedUploadSizeBytes: 1,
    });
    const oldAsset = await assetFor(unfinalized.assetId);
    await database
      .update(schema.assets)
      .set({ createdAt: new Date(now.getTime() - 25 * 60 * 60_000) })
      .where(eq(schema.assets.id, oldAsset.id));
    expect(await instance.expireUnfinalizedUpload(oldAsset.id)).toBe(true);
    expect(await assetFor(oldAsset.id)).toMatchObject({
      status: "FAILED",
      failureCode: "UPLOAD_EXPIRED",
    });
    await expect(
      instance.finalizeUpload({ workspaceId: owner.workspaceId, assetId: oldAsset.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      instance.refreshUploadCapability({ workspaceId: owner.workspaceId, assetId: oldAsset.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const finalized = await instance.beginUpload({
      workspaceId: owner.workspaceId,
      mediaType: "IMAGE",
      displayName: "finalized",
      originalFilename: "finalized.jpg",
      expectedUploadSizeBytes: 1,
    });
    const finalizedAsset = await assetFor(finalized.assetId);
    storage.putStagingObject(finalizedAsset.stagingKey as `staging/${string}`, Buffer.alloc(1));
    await instance.finalizeUpload({ workspaceId: owner.workspaceId, assetId: finalized.assetId });
    await database
      .update(schema.assets)
      .set({ createdAt: new Date(now.getTime() - 25 * 60 * 60_000) })
      .where(eq(schema.assets.id, finalized.assetId));
    expect(await instance.expireUnfinalizedUpload(finalized.assetId)).toBe(false);
    expect(await assetFor(finalized.assetId)).toMatchObject({ status: "PENDING" });
  });

  it("gives Finalize and expiration one safe serialized winner", async () => {
    const owner = await createOwner();
    const { instance, storage } = service(owner.userId);
    const begun = await instance.beginUpload({
      workspaceId: owner.workspaceId,
      mediaType: "IMAGE",
      displayName: "race",
      originalFilename: "race.jpg",
      expectedUploadSizeBytes: 1,
    });
    const asset = await assetFor(begun.assetId);
    storage.putStagingObject(asset.stagingKey as `staging/${string}`, Buffer.alloc(1));
    await database
      .update(schema.assets)
      .set({ createdAt: new Date(now.getTime() - 25 * 60 * 60_000) })
      .where(eq(schema.assets.id, asset.id));
    const [expiration, finalize] = await Promise.allSettled([
      instance.expireUnfinalizedUpload(asset.id),
      instance.finalizeUpload({ workspaceId: owner.workspaceId, assetId: asset.id }),
    ]);
    const stored = await assetFor(asset.id);
    expect(stored.status === "FAILED" || stored.status === "PENDING").toBe(true);
    if (stored.status === "FAILED") {
      expect(expiration.status).toBe("fulfilled");
      expect(finalize.status).toBe("rejected");
      expect(
        await database
          .select()
          .from(schema.assetJobs)
          .where(eq(schema.assetJobs.type, "PROCESS_UPLOAD")),
      ).toHaveLength(0);
    } else {
      expect(finalize.status).toBe("fulfilled");
      expect(expiration.status).toBe("fulfilled");
      expect((expiration as PromiseFulfilledResult<boolean>).value).toBe(false);
      expect(
        await database
          .select()
          .from(schema.assetJobs)
          .where(eq(schema.assetJobs.type, "PROCESS_UPLOAD")),
      ).toHaveLength(1);
    }
  });

  it("retries expired staging cleanup without changing terminal Asset state", async () => {
    const owner = await createOwner();
    const { instance, storage } = service(owner.userId);
    const begun = await instance.beginUpload({
      workspaceId: owner.workspaceId,
      mediaType: "IMAGE",
      displayName: "cleanup-retry",
      originalFilename: "cleanup-retry.jpg",
      expectedUploadSizeBytes: 1,
    });
    const asset = await assetFor(begun.assetId);
    await database
      .update(schema.assets)
      .set({ createdAt: new Date(now.getTime() - 25 * 60 * 60_000) })
      .where(eq(schema.assets.id, asset.id));
    storage.putStagingObject(asset.stagingKey as `staging/${string}`, Buffer.alloc(1));
    storage.failNext("delete");
    await expect(instance.expireUnfinalizedUpload(asset.id)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
    expect(await assetFor(asset.id)).toMatchObject({
      status: "FAILED",
      failureCode: "UPLOAD_EXPIRED",
    });
    expect(await instance.expireUnfinalizedUpload(asset.id)).toBe(true);
    expect(await assetFor(asset.id)).toMatchObject({ status: "FAILED" });
  });
});
