import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import {
  MediaInspectionError,
  type MediaInspectionResult,
} from "../domain/media-inspection-contracts";
import { createAssetJob } from "./asset-job-repository";
import { runAssetJobBatch, MapAssetJobHandlerRegistry } from "./asset-job-runner";
import { createUploadProcessingHandler } from "./upload-processing-handler";
import { FakeAssetStorage } from "../infrastructure/fake-asset-storage";
import type { AssetStorage } from "../infrastructure/asset-storage";
import type { MediaInspector } from "./media-inspector";

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });
const now = new Date("2026-09-08T00:00:00.000Z");

const imageResult: MediaInspectionResult = {
  mediaType: "IMAGE",
  mediaFormat: "JPEG",
  sizeBytes: 4,
  width: 2,
  height: 2,
};

class SequenceInspector implements MediaInspector {
  calls = 0;
  constructor(private readonly results: readonly (MediaInspectionResult | Error)[]) {}

  async inspect(): Promise<MediaInspectionResult> {
    const result = this.results[Math.min(this.calls++, this.results.length - 1)];
    if (result instanceof Error) throw result;
    return result!;
  }
}

class ReservationObservingStorage extends FakeAssetStorage {
  observedPermanentKey: string | null = null;
  assetId = "";

  override async putPermanentFromStream(
    key: Parameters<AssetStorage["putPermanentFromStream"]>[0],
    source: Parameters<AssetStorage["putPermanentFromStream"]>[1],
  ) {
    const [asset] = await database
      .select({ permanentKey: schema.assets.permanentKey })
      .from(schema.assets)
      .where(eq(schema.assets.id, this.assetId));
    this.observedPermanentKey = asset?.permanentKey ?? null;
    return super.putPermanentFromStream(key, source);
  }
}

async function seedAsset(storage: FakeAssetStorage, declaredByteSize = 4, maxAttempts = 5) {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const assetId = randomUUID();
  const stagingKey = `staging/${randomUUID()}` as `staging/${string}`;
  await database
    .insert(schema.user)
    .values({ id: userId, name: "Creator", email: `${userId}@test` });
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
    declaredByteSize,
    stagingKey,
  });
  storage.putStagingObject(stagingKey, Buffer.alloc(declaredByteSize));
  await createAssetJob(database, {
    type: "PROCESS_UPLOAD",
    payload: { assetId },
    scheduledAt: now,
    maxAttempts,
  });
  return { assetId, stagingKey };
}

async function getAsset(assetId: string) {
  const [asset] = await database.select().from(schema.assets).where(eq(schema.assets.id, assetId));
  if (!asset) throw new Error("asset missing");
  return asset;
}

async function runUpload(
  storage: AssetStorage,
  inspector: MediaInspector,
  assetId: string,
  runAt = now,
) {
  return runAssetJobBatch({
    database,
    workerId: randomUUID(),
    registry: new MapAssetJobHandlerRegistry({
      PROCESS_UPLOAD: createUploadProcessingHandler({
        database,
        storage,
        inspector,
        clock: () => runAt,
        logger: { warn: () => undefined },
      }),
    }),
    logger: { info: () => undefined, warn: () => undefined },
    now: () => runAt,
  });
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

describe("upload processing lifecycle", () => {
  it("claims PENDING, reserves permanent ownership before promotion, reinspects, and cleans staging", async () => {
    const storage = new ReservationObservingStorage();
    const seeded = await seedAsset(storage);
    storage.assetId = seeded.assetId;
    const inspector = new SequenceInspector([imageResult, imageResult]);
    await runUpload(storage, inspector, seeded.assetId);
    const asset = await getAsset(seeded.assetId);
    expect(asset).toMatchObject({
      status: "READY",
      byteSize: 4,
      detectedMimeType: "image/jpeg",
      mediaFormat: "JPEG",
      width: 2,
      height: 2,
    });
    expect(asset.permanentKey).toMatch(/^permanent\//);
    expect(storage.observedPermanentKey).toBe(asset.permanentKey);
    expect(inspector.calls).toBe(2);
    expect(storage.operations).toEqual([
      `metadata:${seeded.stagingKey}`,
      `read:${seeded.stagingKey}`,
      `put:${asset.permanentKey}`,
      `metadata:${asset.permanentKey}`,
      `read:${asset.permanentKey}`,
      `delete:${seeded.stagingKey}`,
    ]);
    const operations = [...storage.operations];
    const duplicateHandler = createUploadProcessingHandler({
      database,
      storage,
      inspector,
      logger: { warn: () => undefined },
    });
    expect(
      await duplicateHandler({
        assetId: seeded.assetId,
        attempts: 1,
        maxAttempts: 5,
        heartbeat: async () => true,
      }),
    ).toEqual({ kind: "COMPLETED" });
    expect(storage.operations).toEqual(operations);
  });

  it("reuses a reserved permanent key after a transient promotion failure", async () => {
    const storage = new FakeAssetStorage();
    const seeded = await seedAsset(storage);
    storage.failNext("copy");
    await runUpload(storage, new SequenceInspector([imageResult]), seeded.assetId);
    const afterFirst = await getAsset(seeded.assetId);
    expect(afterFirst).toMatchObject({ status: "PROCESSING" });
    expect(afterFirst.permanentKey).toMatch(/^permanent\//);
    await runUpload(
      storage,
      new SequenceInspector([imageResult, imageResult]),
      seeded.assetId,
      new Date(now.getTime() + 2_000),
    );
    const afterSecond = await getAsset(seeded.assetId);
    expect(afterSecond).toMatchObject({ status: "READY", permanentKey: afterFirst.permanentKey });
    expect(storage.operations.filter((operation) => operation.startsWith("put:")).at(-1)).toContain(
      afterFirst.permanentKey,
    );
  });

  it("makes deterministic inspection failure terminal and does not restart FAILED work", async () => {
    const storage = new FakeAssetStorage();
    const seeded = await seedAsset(storage);
    const inspector = new SequenceInspector([
      new MediaInspectionError("UNSUPPORTED_MEDIA", "unsupported"),
    ]);
    await runUpload(storage, inspector, seeded.assetId);
    expect(await getAsset(seeded.assetId)).toMatchObject({
      status: "FAILED",
      failureCode: "UNSUPPORTED_MEDIA",
    });
    const operations = [...storage.operations];
    const handler = createUploadProcessingHandler({
      database,
      storage,
      inspector,
      logger: { warn: () => undefined },
    });
    expect(
      await handler({
        assetId: seeded.assetId,
        attempts: 1,
        maxAttempts: 5,
        heartbeat: async () => true,
      }),
    ).toEqual({ kind: "COMPLETED" });
    expect(storage.operations).toEqual(operations);
  });

  it("fails safely when permanent reinspection disagrees with staging", async () => {
    const storage = new FakeAssetStorage();
    const seeded = await seedAsset(storage);
    const permanentMismatch = { ...imageResult, mediaFormat: "PNG" as const };
    await runUpload(
      storage,
      new SequenceInspector([imageResult, permanentMismatch]),
      seeded.assetId,
    );
    expect(await getAsset(seeded.assetId)).toMatchObject({
      status: "FAILED",
      failureCode: "MEDIA_TYPE_MISMATCH",
    });
  });

  it("turns a retryable failure into FAILED with a stable code at retry exhaustion", async () => {
    const storage = new FakeAssetStorage();
    const seeded = await seedAsset(storage, 4, 1);
    storage.failNext("copy");
    await runUpload(storage, new SequenceInspector([imageResult]), seeded.assetId);
    expect(await getAsset(seeded.assetId)).toMatchObject({
      status: "FAILED",
      failureCode: "PROCESSING_UNAVAILABLE",
    });
    const [job] = await database
      .select()
      .from(schema.assetJobs)
      .where(eq(schema.assetJobs.dedupeKey, `PROCESS_UPLOAD:${seeded.assetId}`));
    expect(job).toMatchObject({ status: "FAILED", failureCode: "PROCESSING_UNAVAILABLE" });
  });

  it("exposes a source-neutral processor invocation through an internal Asset identity context", async () => {
    const storage = new FakeAssetStorage();
    const seeded = await seedAsset(storage);
    const inspector = new SequenceInspector([imageResult, imageResult]);
    const handler = createUploadProcessingHandler({
      database,
      storage,
      inspector,
      logger: { warn: () => undefined },
    });
    // The handler receives no browser metadata, URL, session, or creator state.
    expect(
      await handler({
        assetId: seeded.assetId,
        attempts: 1,
        maxAttempts: 5,
        heartbeat: async () => true,
      }),
    ).toEqual({ kind: "COMPLETED" });
    expect(await getAsset(seeded.assetId)).toMatchObject({ status: "READY" });
  });
});
