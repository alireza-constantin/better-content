import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import { createPermanentStorageKey } from "../infrastructure/storage-keys";
import { MapAssetJobHandlerRegistry, runAssetJobBatch } from "./asset-job-runner";
import {
  claimDueAssetJobs,
  completeAssetJob,
  createAssetJob,
  failAssetJob,
  heartbeatAssetJobLease,
  reserveAssetPermanentStorageKey,
} from "./asset-job-repository";

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });
const now = new Date("2026-09-07T00:00:00.000Z");

async function seedAsset() {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const assetId = randomUUID();
  await database
    .insert(schema.user)
    .values({ id: userId, name: "Creator", email: `${userId}@example.test` });
  await database.insert(schema.workspaces).values({ id: workspaceId, name: "Workspace" });
  await database.insert(schema.workspaceMembers).values({ workspaceId, userId, role: "owner" });
  await database.insert(schema.assets).values({
    id: assetId,
    workspaceId,
    createdByUserId: userId,
    mediaType: "IMAGE",
    sourceType: "UPLOAD",
    status: "PENDING",
    displayName: "Still",
    originalFilename: "still.jpg",
  });
  return assetId;
}

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "drizzle" });
});

beforeEach(async () => {
  await database.execute(
    'TRUNCATE TABLE "asset_jobs", "asset_references", "assets", "workspace_members", "workspaces", "user" CASCADE',
  );
});

afterAll(async () => {
  await pool.end();
});

describe("Asset PostgreSQL jobs", () => {
  it("creates exactly one durable logical workflow per Asset", async () => {
    const assetId = await seedAsset();
    const [first, second] = await Promise.all([
      createAssetJob(database, { type: "PROCESS_UPLOAD", payload: { assetId } }),
      createAssetJob(database, { type: "PROCESS_UPLOAD", payload: { assetId } }),
    ]);
    expect(first.id).toBe(second.id);
    expect((await database.select().from(schema.assetJobs)).length).toBe(1);
  });

  it("claims once, heartbeats, and safely reclaims an expired lease", async () => {
    const assetId = await seedAsset();
    await createAssetJob(database, {
      type: "PROCESS_UPLOAD",
      payload: { assetId },
      scheduledAt: now,
    });
    const [first, second] = await Promise.all([
      claimDueAssetJobs(database, { workerId: "one", now }),
      claimDueAssetJobs(database, { workerId: "two", now }),
    ]);
    const claimed = [...first, ...second];
    expect(claimed).toHaveLength(1);
    expect(
      await heartbeatAssetJobLease(database, {
        jobId: claimed[0]!.id,
        workerId: claimed[0]!.leaseOwner!,
        now,
        leaseMs: 1_000,
      }),
    ).toBe(true);
    const reclaimed = await claimDueAssetJobs(database, {
      workerId: "replacement",
      now: new Date(now.getTime() + 1_001),
    });
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]!.attempts).toBe(2);
  });

  it("bounds attempts and turns exhausted retryable work terminal", async () => {
    const assetId = await seedAsset();
    const job = await createAssetJob(database, {
      type: "PROCESS_UPLOAD",
      payload: { assetId },
      scheduledAt: now,
      maxAttempts: 2,
    });
    const [first] = await claimDueAssetJobs(database, { workerId: "one", now });
    expect(
      await failAssetJob(database, {
        jobId: first!.id,
        workerId: "one",
        now,
        failureCode: "PROCESSING_UNAVAILABLE",
        retryable: true,
        random: () => 0,
      }),
    ).toBe("RETRY_SCHEDULED");
    const [second] = await claimDueAssetJobs(database, {
      workerId: "two",
      now: new Date(now.getTime() + 1_000),
    });
    expect(
      await failAssetJob(database, {
        jobId: second!.id,
        workerId: "two",
        now: new Date(now.getTime() + 1_000),
        failureCode: "PROCESSING_UNAVAILABLE",
        retryable: true,
      }),
    ).toBe("FAILED");
    const [stored] = await database
      .select()
      .from(schema.assetJobs)
      .where(eq(schema.assetJobs.id, job.id));
    expect(stored).toMatchObject({ status: "FAILED", attempts: 2 });
  });

  it("reserves one permanent key before a future storage promotion", async () => {
    const assetId = await seedAsset();
    const [a, b] = await Promise.all([
      reserveAssetPermanentStorageKey(database, assetId, createPermanentStorageKey()),
      reserveAssetPermanentStorageKey(database, assetId, createPermanentStorageKey()),
    ]);
    expect(a).toBe(b);
  });

  it("runs a bounded handler batch without an HTTP request", async () => {
    const assetId = await seedAsset();
    const job = await createAssetJob(database, {
      type: "PROCESS_UPLOAD",
      payload: { assetId },
      scheduledAt: now,
    });
    const handler = vi.fn(async () => undefined);
    expect(
      await runAssetJobBatch({
        database,
        workerId: "runner",
        registry: new MapAssetJobHandlerRegistry({ PROCESS_UPLOAD: handler }),
        logger: { info: vi.fn(), warn: vi.fn() },
        now: () => now,
      }),
    ).toBe(1);
    expect(handler).toHaveBeenCalledOnce();
    expect(await completeAssetJob(database, { jobId: job.id, workerId: "runner", now })).toBe(
      false,
    );
    expect(
      (await database.select().from(schema.assetJobs).where(eq(schema.assetJobs.id, job.id)))[0]
        ?.status,
    ).toBe("COMPLETED");
  });

  it("lets a handler classify terminal and retryable failures", async () => {
    const terminalAssetId = await seedAsset();
    const retryableAssetId = await seedAsset();
    const terminalJob = await createAssetJob(database, {
      type: "PROCESS_UPLOAD",
      payload: { assetId: terminalAssetId },
      scheduledAt: now,
    });
    const retryableJob = await createAssetJob(database, {
      type: "INGEST_EXTERNAL_URL",
      payload: { assetId: retryableAssetId },
      scheduledAt: now,
    });
    const registry = new MapAssetJobHandlerRegistry()
      .register("PROCESS_UPLOAD", async () => ({
        kind: "FAILED",
        failureCode: "INVALID_MEDIA",
        retryable: false,
      }))
      .register("INGEST_EXTERNAL_URL", async () => ({
        kind: "FAILED",
        failureCode: "MEDIA_SOURCE_UNAVAILABLE",
        retryable: true,
      }));

    await runAssetJobBatch({
      database,
      workerId: "runner",
      registry,
      logger: { info: vi.fn(), warn: vi.fn() },
      now: () => now,
      limit: 2,
    });

    const jobs = await database.select().from(schema.assetJobs);
    expect(jobs.find((job) => job.id === terminalJob.id)).toMatchObject({
      status: "FAILED",
      failureCode: "INVALID_MEDIA",
    });
    expect(jobs.find((job) => job.id === retryableJob.id)).toMatchObject({
      status: "PENDING",
      failureCode: "MEDIA_SOURCE_UNAVAILABLE",
    });
  });

  it("safely leaves an unregistered handler retryable", async () => {
    const assetId = await seedAsset();
    const job = await createAssetJob(database, {
      type: "PROCESS_UPLOAD",
      payload: { assetId },
      scheduledAt: now,
    });
    await runAssetJobBatch({
      database,
      workerId: "runner",
      registry: new MapAssetJobHandlerRegistry(),
      logger: { info: vi.fn(), warn: vi.fn() },
      now: () => now,
    });
    expect(
      (await database.select().from(schema.assetJobs).where(eq(schema.assetJobs.id, job.id)))[0],
    ).toMatchObject({ status: "PENDING", failureCode: "PROCESSING_UNAVAILABLE" });
  });
});
