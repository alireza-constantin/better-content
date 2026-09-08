import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import { contentScriptGenerationSettings } from "@/modules/content/application/content-generation-repository";
import { createAssetLibraryApplicationService } from "./asset-library-service";

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });

async function seedWorkspace() {
  const userId = randomUUID(),
    workspaceId = randomUUID();
  await database
    .insert(schema.user)
    .values({ id: userId, name: "Creator", email: `${userId}@test` });
  await database.insert(schema.workspaces).values({ id: workspaceId, name: "Assets" });
  await database.insert(schema.workspaceMembers).values({ workspaceId, userId, role: "owner" });
  return { userId, workspaceId };
}

async function seedAsset(
  context: Awaited<ReturnType<typeof seedWorkspace>>,
  overrides: Partial<typeof schema.assets.$inferInsert> = {},
) {
  const id = overrides.id ?? randomUUID();
  const sourceType = overrides.sourceType ?? "UPLOAD";
  await database.insert(schema.assets).values({
    id,
    workspaceId: context.workspaceId,
    createdByUserId: context.userId,
    mediaType: "IMAGE",
    sourceType,
    status: "READY",
    displayName: "Cover",
    originalFilename: sourceType === "UPLOAD" ? "cover.jpg" : undefined,
    sourceUrl: sourceType === "EXTERNAL_URL" ? "https://media.example.test/cover" : undefined,
    sourceHost: sourceType === "EXTERNAL_URL" ? "media.example.test" : undefined,
    permanentKey: `permanent/${id}`,
    byteSize: 100,
    detectedMimeType: "image/jpeg",
    mediaFormat: "JPEG",
    width: 100,
    height: 100,
    ...overrides,
  });
  return id;
}

async function seedContentForReference(context: Awaited<ReturnType<typeof seedWorkspace>>) {
  const dnaId = randomUUID();
  const dnaVersionId = randomUUID();
  const ideaRunId = randomUUID();
  const batchId = randomUUID();
  const ideaId = randomUUID();
  const contentRunId = randomUUID();
  const attemptId = randomUUID();
  const contentId = randomUUID();
  const createdAt = new Date("2026-09-08T00:00:00.000Z");
  const document = { schemaVersion: 1 as const, script: { text: "Asset reference" } };
  await database.transaction(async (transaction) => {
    await transaction.insert(schema.contentDna).values({
      id: dnaId,
      workspaceId: context.workspaceId,
      currentVersionId: dnaVersionId,
    });
    await transaction.insert(schema.contentDnaVersions).values({
      id: dnaVersionId,
      contentDnaId: dnaId,
      versionNumber: 1,
      payload: { schemaVersion: 1 } as never,
      createdByUserId: context.userId,
    });
    await transaction.insert(schema.aiRuns).values({
      id: ideaRunId,
      workspaceId: context.workspaceId,
      kind: "IDEA_GENERATION",
      provider: "avalai",
      model: "gpt-5.6-luna",
      promptVersion: "idea-generation/v1",
      generationSettings: contentScriptGenerationSettings,
      status: "PENDING",
    });
    await transaction.insert(schema.ideaGenerationBatches).values({
      id: batchId,
      workspaceId: context.workspaceId,
      contentDnaVersionId: dnaVersionId,
      aiRunId: ideaRunId,
      idempotencyKey: randomUUID(),
      requestFingerprint: "a".repeat(64),
      requestedLanguage: "en",
      requestedCount: 20,
      status: "PENDING",
    });
    await transaction.insert(schema.ideas).values({
      id: ideaId,
      batchId,
      position: 1,
      title: "Reference",
      description: "Reference content",
      language: "en",
      status: "ACCEPTED",
    });
    await transaction.insert(schema.aiRuns).values({
      id: contentRunId,
      workspaceId: context.workspaceId,
      kind: "CONTENT_SCRIPT_GENERATION",
      provider: "avalai",
      model: "gpt-5.6-luna",
      promptVersion: "content-script-generation/v1",
      generationSettings: contentScriptGenerationSettings,
      outputSnapshot: document,
      status: "COMPLETED",
      createdAt,
      startedAt: createdAt,
      completedAt: createdAt,
    });
    await transaction.insert(schema.contentGenerationAttempts).values({
      id: attemptId,
      workspaceId: context.workspaceId,
      sourceIdeaId: ideaId,
      contentDnaVersionId: dnaVersionId,
      requestedLanguage: "en",
      format: "SHORT_VIDEO",
      idempotencyKey: randomUUID(),
      requestFingerprint: "b".repeat(64),
      aiRunId: contentRunId,
      status: "COMPLETED",
      createdAt,
      startedAt: createdAt,
      completedAt: createdAt,
    });
    await transaction.insert(schema.contents).values({
      id: contentId,
      workspaceId: context.workspaceId,
      sourceIdeaId: ideaId,
      contentLanguage: "en",
      format: "SHORT_VIDEO",
      sourceGenerationAttemptId: attemptId,
      createdAt,
    });
    await transaction.insert(schema.contentDrafts).values({
      contentId,
      document,
      revision: 1,
      createdAt,
      updatedAt: createdAt,
    });
    await transaction.insert(schema.contentVersions).values({
      contentId,
      versionNumber: 1,
      document,
      source: "AI_GENERATED",
      aiRunId: contentRunId,
      createdByUserId: context.userId,
      createdAt,
    });
  });
  return contentId;
}

beforeAll(async () => migrate(database, { migrationsFolder: "drizzle" }));
beforeEach(async () =>
  database.execute(
    'TRUNCATE TABLE "asset_admission_events", "asset_jobs", "asset_references", "assets", "workspace_members", "workspaces", "user" CASCADE',
  ),
);
afterAll(async () => pool.end());

describe("Asset Library application service", () => {
  it("returns only current-Workspace safe DTOs in newest/id deterministic pages", async () => {
    const context = await seedWorkspace();
    const createdAt = new Date("2026-09-08T00:00:00.000Z");
    for (let index = 0; index < 25; index += 1)
      await seedAsset(context, {
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        displayName: `Asset ${index}`,
        createdAt,
      });
    const service = createAssetLibraryApplicationService({
      database,
      getAuthenticatedUserId: async () => context.userId,
    });
    const page = await service.getAssetLibrary({ workspaceId: context.workspaceId, page: 1 });
    expect(page.assets).toHaveLength(24);
    expect(page.hasNextPage).toBe(true);
    expect(page.assets[0]?.displayName).toBe("Asset 24");
    expect(page.assets[0]).not.toHaveProperty("sourceUrl");
    expect(page.assets[0]).not.toHaveProperty("permanentKey");
    expect(page.assets[0]).not.toHaveProperty("originalFilename");
    expect(
      (await service.getAssetLibrary({ workspaceId: context.workspaceId, page: 2 })).assets[0]
        ?.displayName,
    ).toBe("Asset 0");
  });

  it("searches display name and upload filename, filters media/lifecycle, and hides foreign assets", async () => {
    const context = await seedWorkspace();
    await seedAsset(context, { displayName: "Persian cover", originalFilename: "not-used.jpg" });
    await seedAsset(context, {
      displayName: "Other",
      originalFilename: "needle.mp4",
      mediaType: "VIDEO",
      status: "PENDING",
      permanentKey: undefined,
      byteSize: undefined,
      detectedMimeType: undefined,
      mediaFormat: undefined,
      width: undefined,
      height: undefined,
    });
    const foreign = await seedWorkspace();
    await seedAsset(foreign, { displayName: "Needle foreign" });
    const service = createAssetLibraryApplicationService({
      database,
      getAuthenticatedUserId: async () => context.userId,
    });
    await expect(
      service.getAssetLibrary({ workspaceId: context.workspaceId, search: "cover" }),
    ).resolves.toMatchObject({ assets: [{ displayName: "Persian cover" }] });
    await expect(
      service.getAssetLibrary({
        workspaceId: context.workspaceId,
        search: "needle",
        mediaType: "VIDEO",
        status: "PENDING",
      }),
    ).resolves.toMatchObject({
      assets: [{ displayName: "Other", status: "PENDING" }],
    });
    const filtered = await service.getAssetLibrary({
      workspaceId: context.workspaceId,
      search: "needle",
    });
    expect(filtered.assets).toHaveLength(1);
    expect(filtered.assets[0]?.displayName).not.toBe("Needle foreign");
  });

  it("reports a distinct Content reference count and rejects a removed member", async () => {
    const context = await seedWorkspace();
    const assetId = await seedAsset(context);
    const contentId = await seedContentForReference(context);
    await database.insert(schema.assetReferences).values([
      {
        workspaceId: context.workspaceId,
        assetId,
        contentId,
        artifactKind: "DRAFT",
        directionId: randomUUID(),
      },
      {
        workspaceId: context.workspaceId,
        assetId,
        contentId,
        artifactKind: "DRAFT",
        directionId: randomUUID(),
      },
    ]);
    const service = createAssetLibraryApplicationService({
      database,
      getAuthenticatedUserId: async () => context.userId,
    });
    await expect(
      service.getAssetLibrary({ workspaceId: context.workspaceId }),
    ).resolves.toMatchObject({
      assets: [{ id: assetId, referenceCount: 1 }],
    });
    await database
      .delete(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.workspaceId, context.workspaceId));
    await expect(
      service.getAssetLibrary({ workspaceId: context.workspaceId }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("renames display metadata only and rejects unsafe bidi controls or DELETING", async () => {
    const context = await seedWorkspace();
    const assetId = await seedAsset(context, { displayName: "Before" });
    const service = createAssetLibraryApplicationService({
      database,
      getAuthenticatedUserId: async () => context.userId,
    });
    await service.renameAsset({
      workspaceId: context.workspaceId,
      assetId,
      displayName: "  نام Video  ",
    });
    const [renamed] = await database
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.id, assetId));
    expect(renamed).toMatchObject({
      displayName: "نام Video",
      permanentKey: `permanent/${assetId}`,
      status: "READY",
    });
    await expect(
      service.renameAsset({
        workspaceId: context.workspaceId,
        assetId,
        displayName: "bad\u202Ename",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await database
      .update(schema.assets)
      .set({ status: "DELETING" })
      .where(eq(schema.assets.id, assetId));
    await expect(
      service.renameAsset({ workspaceId: context.workspaceId, assetId, displayName: "Later" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
