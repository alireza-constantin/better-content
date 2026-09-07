import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import { contentScriptGenerationSettings } from "./content-generation-repository";
import { createContentDraftApplicationService } from "./content-draft-service";
import { createContentAcceptanceApplicationService } from "./content-acceptance-service";
import { createContentReadApplicationService } from "./content-read-service";
import { projectContentDocumentV2ToV3 } from "../domain";
import { contentDocumentV2Schema } from "../domain";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/server", () => ({ getServerSession: vi.fn() }));

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });
const createdAt = new Date("2026-09-01T10:00:00.000Z");
const acceptedAt = new Date("2026-09-01T10:05:00.000Z");

const v1Document = {
  schemaVersion: 1 as const,
  script: { text: "First line\nSecond line" },
};

function v2Document(text: string) {
  return {
    schemaVersion: 2 as const,
    script: {
      blocks: [
        {
          id: randomUUID(),
          type: "paragraph" as const,
          text,
          performanceDirections: [],
          editDirections: [],
        },
      ],
    },
  };
}

async function seedContent(draftDocument: typeof v1Document | ReturnType<typeof v2Document>) {
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
      email: `${userId}@example.com`,
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
      document: draftDocument,
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

function createAcceptanceService(userId: string, clock = () => acceptedAt) {
  return createContentAcceptanceApplicationService({
    database,
    getAuthenticatedUserId: async () => userId,
    clock,
    logger: { info: vi.fn(), warn: vi.fn() },
  });
}

async function contentVersionsFor(contentId: string) {
  return database
    .select()
    .from(schema.contentVersions)
    .where(eq(schema.contentVersions.contentId, contentId))
    .orderBy(schema.contentVersions.versionNumber);
}

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "drizzle" });
});

beforeEach(async () => {
  await database.execute(
    'TRUNCATE TABLE "workspace_content_generation_quota_reservations", "content_versions", "content_drafts", "contents", "content_generation_attempts", "workspace_generation_quota_reservations", "ideas", "idea_generation_batches", "ai_runs", "content_dna_versions", "content_dna", "workspace_members", "workspaces", "user" CASCADE',
  );
});

afterAll(async () => {
  await pool.end();
});

describe("Content acceptance application service", () => {
  it("accepts the authoritative V2 Draft and repeats idempotently", async () => {
    const context = await seedContent(v2Document("Draft A"));
    const service = createAcceptanceService(context.userId);

    const first = await service.acceptContent({
      workspaceId: context.workspaceId,
      contentId: context.contentId,
      expectedDraftRevision: 1,
    });
    const repeated = await service.acceptContent({
      workspaceId: context.workspaceId,
      contentId: context.contentId,
      expectedDraftRevision: 1,
    });

    expect(first.acceptedVersion.versionNumber).toBe(2);
    expect(first.acceptedVersion.document.schemaVersion).toBe(2);
    expect(repeated.acceptedVersion.id).toBe(first.acceptedVersion.id);
    expect(await contentVersionsFor(context.contentId)).toHaveLength(2);

    const [draft] = await database
      .select()
      .from(schema.contentDrafts)
      .where(eq(schema.contentDrafts.contentId, context.contentId));
    expect(draft?.document).toMatchObject({
      schemaVersion: 2,
      script: { blocks: [{ text: "Draft A" }] },
    });
    expect(draft?.revision).toBe(1);
    expect(
      await database
        .select()
        .from(schema.assetReferences)
        .where(eq(schema.assetReferences.contentId, context.contentId)),
    ).toHaveLength(0);

    const [content] = await database
      .select()
      .from(schema.contents)
      .where(eq(schema.contents.id, context.contentId));
    expect(content?.acceptedVersionId).toBe(first.acceptedVersion.id);
  });

  it("returns an ordered, safe history read model with only the current accepted marker", async () => {
    const context = await seedContent(v2Document("Draft A"));
    const acceptance = createAcceptanceService(context.userId);
    await acceptance.acceptContent({
      workspaceId: context.workspaceId,
      contentId: context.contentId,
      expectedDraftRevision: 1,
    });
    const reads = createContentReadApplicationService({
      database,
      getAuthenticatedUserId: async () => context.userId,
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    const detail = await reads.getContentDetail({
      workspaceId: context.workspaceId,
      contentId: context.contentId,
    });

    expect(detail.versions.map((version) => version.versionNumber)).toEqual([2, 1]);
    expect(detail.versions.filter((version) => version.isCurrentAccepted)).toHaveLength(1);
    expect(detail.versions.find((version) => version.isCurrentAccepted)?.source).toBe(
      "CREATOR_ACCEPTED",
    );
    expect(
      detail.versions.find((version) => version.source === "AI_GENERATED")?.isCurrentAccepted,
    ).toBe(false);
  });

  it("creates a new approval after a Draft change, including a historical-identical return", async () => {
    const context = await seedContent(v2Document("Draft A"));
    const service = createAcceptanceService(context.userId);
    const drafts = createContentDraftApplicationService({
      database,
      getAuthenticatedUserId: async () => context.userId,
      clock: () => acceptedAt,
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    const first = await service.acceptContent({
      workspaceId: context.workspaceId,
      contentId: context.contentId,
      expectedDraftRevision: 1,
    });
    const changed = v2Document("Draft B");
    await drafts.saveContentDraft({
      workspaceId: context.workspaceId,
      contentId: context.contentId,
      baseRevision: 1,
      document: changed,
    });
    const second = await service.acceptContent({
      workspaceId: context.workspaceId,
      contentId: context.contentId,
      expectedDraftRevision: 2,
    });
    await drafts.saveContentDraft({
      workspaceId: context.workspaceId,
      contentId: context.contentId,
      baseRevision: 2,
      document: projectContentDocumentV2ToV3(
        contentDocumentV2Schema.parse(first.acceptedVersion.document),
      ),
    });
    const third = await service.acceptContent({
      workspaceId: context.workspaceId,
      contentId: context.contentId,
      expectedDraftRevision: 3,
    });

    expect(second.acceptedVersion.id).not.toBe(first.acceptedVersion.id);
    expect(third.acceptedVersion.id).not.toBe(first.acceptedVersion.id);
    expect(third.acceptedVersion.id).not.toBe(second.acceptedVersion.id);
    expect(third.acceptedVersion.versionNumber).toBe(4);
    expect(
      (await contentVersionsFor(context.contentId)).map((version) => version.versionNumber),
    ).toEqual([1, 2, 3, 4]);
  });

  it("migrates a legacy V1 Draft atomically before creating its accepted V3 Version", async () => {
    const context = await seedContent(v1Document);
    const service = createAcceptanceService(context.userId);

    const result = await service.acceptContent({
      workspaceId: context.workspaceId,
      contentId: context.contentId,
      expectedDraftRevision: 1,
    });
    const versions = await contentVersionsFor(context.contentId);
    const [draft] = await database
      .select()
      .from(schema.contentDrafts)
      .where(eq(schema.contentDrafts.contentId, context.contentId));

    expect(versions.map((version) => [version.versionNumber, version.source])).toEqual([
      [1, "AI_GENERATED"],
      [2, "LEGACY_DRAFT_CHECKPOINT"],
      [3, "CREATOR_ACCEPTED"],
    ]);
    expect(versions[1]?.document).toEqual(v1Document);
    expect(result.acceptedVersion.document.schemaVersion).toBe(3);
    expect(draft?.document).toEqual(result.acceptedVersion.document);
    expect(draft?.revision).toBe(2);
    expect(
      await database
        .select()
        .from(schema.assetReferences)
        .where(eq(schema.assetReferences.contentId, context.contentId)),
    ).toHaveLength(0);
  });

  it("leaves an over-limit legacy Draft untouched when acceptance migration fails", async () => {
    const tooManyLines = Array.from({ length: 1001 }, () => "x").join("\n");
    const context = await seedContent({ schemaVersion: 1, script: { text: tooManyLines } });
    const service = createAcceptanceService(context.userId);

    await expect(
      service.acceptContent({
        workspaceId: context.workspaceId,
        contentId: context.contentId,
        expectedDraftRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const versions = await contentVersionsFor(context.contentId);
    const [draft] = await database
      .select()
      .from(schema.contentDrafts)
      .where(eq(schema.contentDrafts.contentId, context.contentId));
    expect(versions).toHaveLength(1);
    expect(draft?.revision).toBe(1);
    expect(draft?.document).toEqual({ schemaVersion: 1, script: { text: tooManyLines } });
  });

  it("rejects a stale revision before acceptance idempotency and serializes concurrent accepts", async () => {
    const context = await seedContent(v2Document("Draft A"));
    const service = createAcceptanceService(context.userId);
    const drafts = createContentDraftApplicationService({
      database,
      getAuthenticatedUserId: async () => context.userId,
      clock: () => acceptedAt,
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    await drafts.saveContentDraft({
      workspaceId: context.workspaceId,
      contentId: context.contentId,
      baseRevision: 1,
      document: v2Document("Newer Draft"),
    });
    await expect(
      service.acceptContent({
        workspaceId: context.workspaceId,
        contentId: context.contentId,
        expectedDraftRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await contentVersionsFor(context.contentId)).toHaveLength(1);

    const concurrent = await Promise.all([
      service.acceptContent({
        workspaceId: context.workspaceId,
        contentId: context.contentId,
        expectedDraftRevision: 2,
      }),
      service.acceptContent({
        workspaceId: context.workspaceId,
        contentId: context.contentId,
        expectedDraftRevision: 2,
      }),
    ]);
    expect(concurrent[0].acceptedVersion.id).toBe(concurrent[1].acceptedVersion.id);
    expect(await contentVersionsFor(context.contentId)).toHaveLength(2);
  });

  it("does not accept an AI-generated pointer even when the relational pointer is same-Content", async () => {
    const context = await seedContent(v2Document("Draft A"));
    await database
      .update(schema.contents)
      .set({ acceptedVersionId: (await contentVersionsFor(context.contentId))[0]?.id })
      .where(eq(schema.contents.id, context.contentId));
    const service = createAcceptanceService(context.userId);

    await expect(
      service.acceptContent({
        workspaceId: context.workspaceId,
        contentId: context.contentId,
        expectedDraftRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    const [content] = await database
      .select({ acceptedVersionId: schema.contents.acceptedVersionId })
      .from(schema.contents)
      .where(eq(schema.contents.id, context.contentId));
    expect(content?.acceptedVersionId).toBe((await contentVersionsFor(context.contentId))[0]?.id);
  });
});
