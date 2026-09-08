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
import { FakeAssetStorage } from "../infrastructure/fake-asset-storage";
import { createAssetJob } from "./asset-job-repository";
import { MapAssetJobHandlerRegistry, runAssetJobBatch } from "./asset-job-runner";
import { createExternalUrlIngestionHandler } from "./external-url-ingestion-handler";
import type { MediaInspector } from "./media-inspector";

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });
const now = new Date("2026-09-08T00:00:00.000Z");
const image: MediaInspectionResult = {
  mediaType: "IMAGE",
  mediaFormat: "JPEG",
  sizeBytes: 4,
  width: 2,
  height: 2,
};

class Inspector implements MediaInspector {
  calls = 0;
  constructor(private readonly result: MediaInspectionResult | Error = image) {}
  async inspect() {
    this.calls += 1;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

async function seed(mediaType: "IMAGE" | "AUDIO" = "IMAGE") {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const assetId = randomUUID();
  await database
    .insert(schema.user)
    .values({ id: userId, name: "Creator", email: `${userId}@test` });
  await database.insert(schema.workspaces).values({ id: workspaceId, name: "Workspace" });
  await database.insert(schema.workspaceMembers).values({ workspaceId, userId, role: "owner" });
  await database.insert(schema.assets).values({
    id: assetId,
    workspaceId,
    createdByUserId: userId,
    mediaType,
    sourceType: "EXTERNAL_URL",
    status: "PENDING",
    displayName: "Remote still",
    sourceUrl: "https://media.example/still",
    sourceHost: "media.example",
    stagingKey: `staging/${randomUUID()}`,
  });
  await createAssetJob(database, {
    type: "INGEST_EXTERNAL_URL",
    payload: { assetId },
    scheduledAt: now,
  });
  return assetId;
}

beforeAll(async () => migrate(database, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await database.execute(
    'TRUNCATE TABLE "asset_admission_events", "asset_jobs", "asset_references", "assets", "workspace_members", "workspaces", "user" CASCADE',
  );
});
afterAll(async () => pool.end());

describe("external URL ingestion", () => {
  it("streams remote bytes to staging then invokes the existing shared processor to READY", async () => {
    const assetId = await seed();
    const storage = new FakeAssetStorage();
    const inspector = new Inspector();
    let connection: { address: string; servername: string } | undefined;
    const handler = createExternalUrlIngestionHandler({
      database,
      storage,
      inspector,
      clock: () => now,
      logger: { warn: () => undefined },
      resolver: { resolve: async () => [{ address: "8.8.8.8", family: 4 }] },
      transport: {
        request: async (input) => {
          connection = { address: input.address.address, servername: input.servername };
          return {
            statusCode: 200,
            headers: { "content-length": "4" },
            body: (async function* () {
              yield Buffer.from("jpeg");
            })(),
          };
        },
      },
    });
    await runAssetJobBatch({
      database,
      workerId: randomUUID(),
      registry: new MapAssetJobHandlerRegistry({ INGEST_EXTERNAL_URL: handler }),
      logger: { info: () => undefined, warn: () => undefined },
      now: () => now,
    });
    const [asset] = await database
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.id, assetId));
    expect(asset).toMatchObject({
      status: "READY",
      byteSize: 4,
      mediaFormat: "JPEG",
      sourceUrl: "https://media.example/still",
    });
    expect(inspector.calls).toBe(2);
    expect(connection).toEqual({ address: "8.8.8.8", servername: "media.example" });
    expect(storage.operations.some((operation) => operation.startsWith("staging-put:"))).toBe(true);
    expect(
      storage.operations.filter((operation) => operation.startsWith("put:permanent/")),
    ).toHaveLength(1);
  });

  it("does not restart a READY Asset on duplicate delivery", async () => {
    const assetId = await seed();
    const storage = new FakeAssetStorage();
    const inspector = new Inspector();
    const handler = createExternalUrlIngestionHandler({
      database,
      storage,
      inspector,
      clock: () => now,
      resolver: { resolve: async () => [{ address: "8.8.8.8", family: 4 }] },
      transport: {
        request: async () => ({
          statusCode: 200,
          headers: {},
          body: (async function* () {
            yield Buffer.from("jpeg");
          })(),
        }),
      },
    });
    await handler({ assetId, attempts: 1, maxAttempts: 5, heartbeat: async () => true });
    const before = [...storage.operations];
    expect(
      await handler({ assetId, attempts: 2, maxAttempts: 5, heartbeat: async () => true }),
    ).toEqual({ kind: "COMPLETED" });
    expect(storage.operations).toEqual(before);
  });

  it("uses the same staged-media processor for AUDIO without URL-based type inference", async () => {
    const assetId = await seed("AUDIO");
    const audio: MediaInspectionResult = {
      mediaType: "AUDIO",
      mediaFormat: "MP3",
      sizeBytes: 4,
      durationMs: 1,
      audioCodec: "mp3",
    };
    const handler = createExternalUrlIngestionHandler({
      database,
      storage: new FakeAssetStorage(),
      inspector: new Inspector(audio),
      clock: () => now,
      resolver: { resolve: async () => [{ address: "8.8.8.8", family: 4 }] },
      transport: {
        request: async () => ({
          statusCode: 200,
          headers: {},
          body: (async function* () {
            yield Buffer.from("mp3!");
          })(),
        }),
      },
    });
    await handler({ assetId, attempts: 1, maxAttempts: 5, heartbeat: async () => true });
    const [asset] = await database
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.id, assetId));
    expect(asset).toMatchObject({ status: "READY", mediaType: "AUDIO", mediaFormat: "MP3" });
  });

  it.each([
    [new MediaInspectionError("MEDIA_TYPE_MISMATCH", "mismatch"), "MEDIA_TYPE_MISMATCH"],
    [new MediaInspectionError("UNSUPPORTED_MEDIA", "unsupported"), "UNSUPPORTED_MEDIA"],
  ] as const)(
    "maps authoritative inspection failures to terminal safe codes",
    async (result, failureCode) => {
      const assetId = await seed();
      const handler = createExternalUrlIngestionHandler({
        database,
        storage: new FakeAssetStorage(),
        inspector: new Inspector(result),
        clock: () => now,
        resolver: { resolve: async () => [{ address: "8.8.8.8", family: 4 }] },
        transport: {
          request: async () => ({
            statusCode: 200,
            headers: {},
            body: (async function* () {
              yield Buffer.from("jpeg");
            })(),
          }),
        },
      });
      expect(
        await handler({ assetId, attempts: 1, maxAttempts: 5, heartbeat: async () => true }),
      ).toEqual({
        kind: "FAILED",
        failureCode,
        retryable: false,
      });
      const [asset] = await database
        .select()
        .from(schema.assets)
        .where(eq(schema.assets.id, assetId));
      expect(asset).toMatchObject({ status: "FAILED", failureCode });
    },
  );

  it("leaves transient remote failure retryable and never writes source provenance to the job", async () => {
    const assetId = await seed();
    const handler = createExternalUrlIngestionHandler({
      database,
      storage: new FakeAssetStorage(),
      inspector: new Inspector(),
      clock: () => now,
      resolver: { resolve: async () => [{ address: "8.8.8.8", family: 4 }] },
      transport: {
        request: async () => ({ statusCode: 503, headers: {}, body: (async function* () {})() }),
      },
    });
    expect(
      await handler({ assetId, attempts: 1, maxAttempts: 5, heartbeat: async () => true }),
    ).toEqual({
      kind: "FAILED",
      failureCode: "MEDIA_SOURCE_UNAVAILABLE",
      retryable: true,
    });
    const [job] = await database
      .select()
      .from(schema.assetJobs)
      .where(eq(schema.assetJobs.dedupeKey, `INGEST_EXTERNAL_URL:${assetId}`));
    expect(job?.payload).toEqual({ assetId });
  });
});
