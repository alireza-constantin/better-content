import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import { createExternalUrlApplicationService } from "./external-url-service";

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

function service(userId: string) {
  return createExternalUrlApplicationService({
    database,
    clock: () => now,
    getAuthenticatedUserId: async () => userId,
    logger: { info: () => undefined },
  });
}

beforeAll(async () => migrate(database, { migrationsFolder: "drizzle" }));
beforeEach(async () => {
  await database.execute(
    'TRUNCATE TABLE "asset_admission_events", "asset_jobs", "asset_references", "assets", "workspace_members", "workspaces", "user" CASCADE',
  );
});
afterAll(async () => pool.end());

describe("external URL Asset creation", () => {
  it("creates one pending immutable Asset and one ID-only logical ingestion workflow", async () => {
    const owner = await createOwner();
    const result = await service(owner.userId).createExternalUrlAsset({
      workspaceId: owner.workspaceId,
      mediaType: "IMAGE",
      displayName: "  Cover  ",
      sourceUrl: "https://BÜCHER.example/media?id=1#ignored",
    });
    const [asset] = await database
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.id, result.assetId));
    const [job] = await database
      .select()
      .from(schema.assetJobs)
      .where(eq(schema.assetJobs.dedupeKey, `INGEST_EXTERNAL_URL:${result.assetId}`));
    expect(asset).toMatchObject({
      sourceType: "EXTERNAL_URL",
      status: "PENDING",
      displayName: "Cover",
      sourceUrl: "https://xn--bcher-kva.example/media?id=1",
      sourceHost: "xn--bcher-kva.example",
      originalFilename: null,
      declaredByteSize: null,
    });
    expect(asset?.stagingKey).toMatch(/^staging\//);
    expect(job).toMatchObject({
      type: "INGEST_EXTERNAL_URL",
      payload: { assetId: result.assetId },
    });
    expect(JSON.stringify(job?.payload)).not.toContain("bcher");
  });

  it("uses the established owner/admission boundary without creating records on denial", async () => {
    const owner = await createOwner();
    const foreign = await createOwner();
    await expect(
      service(foreign.userId).createExternalUrlAsset({
        workspaceId: owner.workspaceId,
        mediaType: "IMAGE",
        displayName: "no",
        sourceUrl: "https://example.com/a",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (let index = 0; index < 5; index += 1)
      await service(owner.userId).createExternalUrlAsset({
        workspaceId: owner.workspaceId,
        mediaType: "IMAGE",
        displayName: `asset-${index}`,
        sourceUrl: `https://example.com/${index}`,
      });
    await expect(
      service(owner.userId).createExternalUrlAsset({
        workspaceId: owner.workspaceId,
        mediaType: "IMAGE",
        displayName: "blocked",
        sourceUrl: "https://example.com/blocked",
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await database.select().from(schema.assets)).toHaveLength(5);
    expect(await database.select().from(schema.assetJobs)).toHaveLength(5);
  });
});
