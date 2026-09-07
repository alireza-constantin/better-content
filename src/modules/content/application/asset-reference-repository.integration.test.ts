import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import { contentScriptGenerationSettings } from "./content-generation-repository";
import { createContentDraftApplicationService } from "./content-draft-service";
import { createContentAcceptanceApplicationService } from "./content-acceptance-service";
import {
  countAssetContentReferences,
  rebuildAssetReferencesBatch,
  reconcileAssetReferencesForArtifact,
} from "./asset-reference-repository";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/server", () => ({ getServerSession: vi.fn() }));

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });
const createdAt = new Date("2026-09-08T10:00:00.000Z");

const v1Document = {
  schemaVersion: 1 as const,
  script: { text: "First line\nSecond line" },
};

function v3Document(assetId: string, text = "Asset-backed script") {
  return {
    schemaVersion: 3 as const,
    script: {
      blocks: [
        {
          id: randomUUID(),
          type: "paragraph" as const,
          text,
          performanceDirections: [],
          editDirections: [
            {
              id: randomUUID(),
              type: "BROLL_CUE" as const,
              description: "Show the supporting visual.",
              assetId,
            },
          ],
        },
      ],
    },
  };
}

async function seedContent() {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const dnaId = randomUUID();
  const dnaVersionId = randomUUID();
  const ideaRunId = randomUUID();
  const batchId = randomUUID();
  const ideaId = randomUUID();
  const contentRunId = randomUUID();
  const attemptId = randomUUID();
  const contentId = randomUUID();

  await database.transaction(async (transaction) => {
    await transaction.insert(schema.user).values({
      id: userId,
      name: "Creator",
      email: `${userId}@example.test`,
    });
    await transaction.insert(schema.workspaces).values({ id: workspaceId, name: "Workspace" });
    await transaction.insert(schema.workspaceMembers).values({
      workspaceId,
      userId,
      role: "owner",
    });
    await transaction.insert(schema.contentDna).values({
      id: dnaId,
      workspaceId,
      currentVersionId: dnaVersionId,
    });
    await transaction.insert(schema.contentDnaVersions).values({
      id: dnaVersionId,
      contentDnaId: dnaId,
      versionNumber: 1,
      payload: { schemaVersion: 1 } as never,
      createdByUserId: userId,
    });
    await transaction.insert(schema.aiRuns).values({
      id: ideaRunId,
      workspaceId,
      kind: "IDEA_GENERATION",
      provider: "avalai",
      model: "gpt-5.6-luna",
      promptVersion: "idea-generation/v1",
      generationSettings: contentScriptGenerationSettings,
      status: "PENDING",
    });
    await transaction.insert(schema.ideaGenerationBatches).values({
      id: batchId,
      workspaceId,
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
      title: "An idea",
      description: "A description",
      language: "en",
      status: "ACCEPTED",
    });
    await transaction.insert(schema.aiRuns).values({
      id: contentRunId,
      workspaceId,
      kind: "CONTENT_SCRIPT_GENERATION",
      provider: "avalai",
      model: "gpt-5.6-luna",
      promptVersion: "content-script-generation/v1",
      generationSettings: contentScriptGenerationSettings,
      status: "COMPLETED",
      outputSnapshot: v1Document,
      createdAt,
      startedAt: createdAt,
      completedAt: createdAt,
    });
    await transaction.insert(schema.contentGenerationAttempts).values({
      id: attemptId,
      workspaceId,
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
      workspaceId,
      sourceIdeaId: ideaId,
      contentLanguage: "en",
      format: "SHORT_VIDEO",
      sourceGenerationAttemptId: attemptId,
      createdAt,
    });
    await transaction.insert(schema.contentDrafts).values({
      contentId,
      document: v1Document,
      revision: 1,
      createdAt,
      updatedAt: createdAt,
    });
    await transaction.insert(schema.contentVersions).values({
      contentId,
      versionNumber: 1,
      document: v1Document,
      source: "AI_GENERATED",
      aiRunId: contentRunId,
      createdByUserId: userId,
      createdAt,
    });
  });

  return { userId, workspaceId, contentId };
}

async function seedReadyAsset(workspaceId: string, userId: string) {
  const assetId = randomUUID();
  await database.insert(schema.assets).values({
    id: assetId,
    workspaceId,
    createdByUserId: userId,
    mediaType: "IMAGE",
    sourceType: "UPLOAD",
    status: "READY",
    displayName: "Still",
    originalFilename: "still.jpg",
    permanentKey: `permanent/${assetId}`,
    byteSize: 100,
    detectedMimeType: "image/jpeg",
    mediaFormat: "JPEG",
    width: 100,
    height: 100,
  });
  return assetId;
}

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "drizzle" });
});

beforeEach(async () => {
  await database.execute(
    'TRUNCATE TABLE "asset_references", "assets", "content_versions", "content_drafts", "contents", "content_generation_attempts", "idea_generation_batches", "ai_runs", "content_dna_versions", "content_dna", "workspace_members", "workspaces", "user" CASCADE',
  );
});

afterAll(async () => {
  await pool.end();
});

describe("Asset-reference PostgreSQL projection", () => {
  it("counts distinct Contents and rebuilds missing and stale Draft/Version rows idempotently", async () => {
    const context = await seedContent();
    const assetId = await seedReadyAsset(context.workspaceId, context.userId);
    const document = v3Document(assetId);

    const [acceptedVersion] = await database
      .insert(schema.contentVersions)
      .values({
        contentId: context.contentId,
        versionNumber: 2,
        document,
        source: "CREATOR_ACCEPTED",
        createdByUserId: context.userId,
        createdAt,
      })
      .returning();
    if (!acceptedVersion) throw new Error("Accepted Version was not created.");
    await database
      .update(schema.contents)
      .set({ acceptedVersionId: acceptedVersion.id })
      .where(eq(schema.contents.id, context.contentId));
    await database
      .update(schema.contentDrafts)
      .set({ document })
      .where(eq(schema.contentDrafts.contentId, context.contentId));

    await database.transaction(async (transaction) => {
      await reconcileAssetReferencesForArtifact(transaction, {
        workspaceId: context.workspaceId,
        contentId: context.contentId,
        artifactKind: "DRAFT",
        document,
      });
      await reconcileAssetReferencesForArtifact(transaction, {
        workspaceId: context.workspaceId,
        contentId: context.contentId,
        artifactKind: "VERSION",
        versionId: acceptedVersion.id,
        document,
      });
    });

    expect(
      await database
        .select()
        .from(schema.assetReferences)
        .where(eq(schema.assetReferences.contentId, context.contentId)),
    ).toHaveLength(2);
    expect(
      await countAssetContentReferences(database, { workspaceId: context.workspaceId, assetId }),
    ).toBe(1);

    await database.delete(schema.assetReferences);
    const [aiVersion] = await database
      .select()
      .from(schema.contentVersions)
      .where(
        and(
          eq(schema.contentVersions.contentId, context.contentId),
          eq(schema.contentVersions.versionNumber, 1),
        ),
      );
    if (!aiVersion) throw new Error("AI Version was not found.");
    await database.insert(schema.assetReferences).values({
      workspaceId: context.workspaceId,
      assetId,
      contentId: context.contentId,
      artifactKind: "VERSION",
      versionId: aiVersion.id,
      directionId: randomUUID(),
    });

    let cursor = null;
    let processed = 0;
    do {
      const result = await rebuildAssetReferencesBatch(database, {
        workspaceId: context.workspaceId,
        limit: 1,
        cursor,
      });
      processed += result.processed;
      cursor = result.nextCursor;
    } while (cursor);

    expect(processed).toBe(3);
    const rebuilt = await database
      .select()
      .from(schema.assetReferences)
      .where(eq(schema.assetReferences.contentId, context.contentId));
    expect(rebuilt).toHaveLength(2);
    expect(rebuilt.every((reference) => reference.assetId === assetId)).toBe(true);

    const secondPass = await rebuildAssetReferencesBatch(database, {
      workspaceId: context.workspaceId,
      limit: 50,
    });
    expect(secondPass.nextCursor).toBeNull();
    expect(
      await database
        .select()
        .from(schema.assetReferences)
        .where(eq(schema.assetReferences.contentId, context.contentId)),
    ).toHaveLength(2);

    await expect(
      database.delete(schema.assets).where(eq(schema.assets.id, assetId)),
    ).rejects.toThrow();
  });

  it("creates V3 Version references atomically with acceptance", async () => {
    const context = await seedContent();
    const assetId = await seedReadyAsset(context.workspaceId, context.userId);
    const document = v3Document(assetId, "Accepted asset-backed script");
    const drafts = createContentDraftApplicationService({
      database,
      getAuthenticatedUserId: async () => context.userId,
      clock: () => createdAt,
      logger: { info: vi.fn(), warn: vi.fn() },
    });
    const saved = await drafts.saveContentDraft({
      workspaceId: context.workspaceId,
      contentId: context.contentId,
      baseRevision: 1,
      document,
    });
    expect(saved.revision).toBe(2);

    const acceptance = createContentAcceptanceApplicationService({
      database,
      getAuthenticatedUserId: async () => context.userId,
      clock: () => createdAt,
      logger: { info: vi.fn(), warn: vi.fn() },
    });
    const result = await acceptance.acceptContent({
      workspaceId: context.workspaceId,
      contentId: context.contentId,
      expectedDraftRevision: 2,
    });
    const references = await database
      .select()
      .from(schema.assetReferences)
      .where(eq(schema.assetReferences.contentId, context.contentId));
    expect(references).toHaveLength(2);
    expect(references.some((reference) => reference.artifactKind === "DRAFT")).toBe(true);
    expect(
      references.some(
        (reference) =>
          reference.artifactKind === "VERSION" && reference.versionId === result.acceptedVersion.id,
      ),
    ).toBe(true);
  });

  it("rejects cross-workspace Draft references atomically and enforces Version FK shapes", async () => {
    const first = await seedContent();
    const second = await seedContent();
    const foreignAssetId = await seedReadyAsset(second.workspaceId, second.userId);
    const foreignDocument = v3Document(foreignAssetId, "Foreign asset");
    const drafts = createContentDraftApplicationService({
      database,
      getAuthenticatedUserId: async () => first.userId,
      clock: () => createdAt,
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    await expect(
      drafts.saveContentDraft({
        workspaceId: first.workspaceId,
        contentId: first.contentId,
        baseRevision: 1,
        document: foreignDocument,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const [unchangedDraft] = await database
      .select()
      .from(schema.contentDrafts)
      .where(eq(schema.contentDrafts.contentId, first.contentId));
    expect(unchangedDraft?.document).toEqual(v1Document);
    expect(unchangedDraft?.revision).toBe(1);
    expect(
      await database
        .select()
        .from(schema.contentVersions)
        .where(eq(schema.contentVersions.contentId, first.contentId)),
    ).toHaveLength(1);
    expect(
      await database
        .select()
        .from(schema.assetReferences)
        .where(eq(schema.assetReferences.contentId, first.contentId)),
    ).toHaveLength(0);

    const [firstVersion] = await database
      .select()
      .from(schema.contentVersions)
      .where(eq(schema.contentVersions.contentId, first.contentId));
    const [secondVersion] = await database
      .select()
      .from(schema.contentVersions)
      .where(eq(schema.contentVersions.contentId, second.contentId));
    if (!firstVersion || !secondVersion) throw new Error("Test Versions were not created.");

    await expect(
      database.insert(schema.assetReferences).values({
        workspaceId: first.workspaceId,
        assetId: foreignAssetId,
        contentId: first.contentId,
        artifactKind: "VERSION",
        versionId: secondVersion.id,
        directionId: randomUUID(),
      }),
    ).rejects.toThrow();
    await expect(
      database.insert(schema.assetReferences).values({
        workspaceId: first.workspaceId,
        assetId: foreignAssetId,
        contentId: first.contentId,
        artifactKind: "DRAFT",
        versionId: firstVersion.id,
        directionId: randomUUID(),
      }),
    ).rejects.toThrow();
  });

  it("rolls back an invalid V3 acceptance before its Version or references escape", async () => {
    const context = await seedContent();
    const foreign = await seedContent();
    const foreignAssetId = await seedReadyAsset(foreign.workspaceId, foreign.userId);
    const invalidDocument = v3Document(foreignAssetId, "Invalid acceptance");
    await database
      .update(schema.contentDrafts)
      .set({ document: invalidDocument })
      .where(eq(schema.contentDrafts.contentId, context.contentId));

    const acceptance = createContentAcceptanceApplicationService({
      database,
      getAuthenticatedUserId: async () => context.userId,
      clock: () => createdAt,
      logger: { info: vi.fn(), warn: vi.fn() },
    });
    await expect(
      acceptance.acceptContent({
        workspaceId: context.workspaceId,
        contentId: context.contentId,
        expectedDraftRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(
      await database
        .select()
        .from(schema.contentVersions)
        .where(eq(schema.contentVersions.contentId, context.contentId)),
    ).toHaveLength(1);
    const [content] = await database
      .select()
      .from(schema.contents)
      .where(eq(schema.contents.id, context.contentId));
    expect(content?.acceptedVersionId).toBeNull();
    expect(
      await database
        .select()
        .from(schema.assetReferences)
        .where(eq(schema.assetReferences.contentId, context.contentId)),
    ).toHaveLength(0);
  });
});
