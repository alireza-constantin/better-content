import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import { FakeGenerateIdeasProvider } from "@/modules/ai/testing/fake-generate-ideas-provider";
import { contentScriptGenerationSettings } from "@/modules/content/application/content-generation-repository";
import {
  parseContentDnaPayload,
  type ContentDnaPayload,
} from "@/modules/dna/domain/content-dna-payload";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/server", () => ({ getServerSession: vi.fn() }));

import { createIdeaGenerationApplicationService } from "./generation-service";
import { createIdeaLibraryApplicationService } from "./idea-library-service";

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });

const readyPayload: ContentDnaPayload = parseContentDnaPayload({
  schemaVersion: 1,
  identity: { creatorOrBrandDescription: "An educator who explains practical workflows." },
  audience: { targetAudienceDescription: "Creators building a consistent publishing habit." },
  expertise: { primaryTopics: ["Content strategy"] },
  voice: { toneTraits: ["Practical", "Warm"] },
  goals: { contentGoals: ["Teach creators"] },
  language: { defaultContentLanguage: "en", contentLanguages: ["en", "fa"] },
});

function logger() {
  return { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
}

async function createContext() {
  const [user] = await database
    .insert(schema.user)
    .values({ id: randomUUID(), name: "Creator", email: `${randomUUID()}@example.test` })
    .returning();
  const [workspace] = await database
    .insert(schema.workspaces)
    .values({ name: "Workspace" })
    .returning();

  if (!user || !workspace) throw new Error("The Library test context was not created.");

  await database.insert(schema.workspaceMembers).values({
    workspaceId: workspace.id,
    userId: user.id,
    role: "owner",
  });

  const contentDnaId = randomUUID();
  const contentDnaVersionId = randomUUID();
  await database.transaction(async (transaction) => {
    await transaction.insert(schema.contentDna).values({
      id: contentDnaId,
      workspaceId: workspace.id,
      currentVersionId: contentDnaVersionId,
    });
    await transaction.insert(schema.contentDnaVersions).values({
      id: contentDnaVersionId,
      contentDnaId,
      versionNumber: 1,
      payload: readyPayload,
      createdByUserId: user.id,
    });
  });

  return { contentDnaVersionId, user, workspace };
}

async function generateTwoBatches(context: Awaited<ReturnType<typeof createContext>>) {
  const generation = createIdeaGenerationApplicationService({
    database,
    getAuthenticatedUserId: async () => context.user.id,
    logger: logger(),
    providerFactory: () => new FakeGenerateIdeasProvider(),
  });
  const input = () => ({
    workspaceId: context.workspace.id,
    baseContentDnaVersionId: context.contentDnaVersionId,
    requestedLanguage: "en" as const,
    idempotencyKey: randomUUID(),
  });

  const first = await generation.generateIdeas(input());
  const second = await generation.generateIdeas(input());

  return { first, second };
}

async function ideaAt(batchId: string, position: number) {
  const [idea] = await database
    .select()
    .from(schema.ideas)
    .where(and(eq(schema.ideas.batchId, batchId), eq(schema.ideas.position, position)));

  if (!idea) throw new Error("The generated Idea was not found.");

  return idea;
}

async function seedContent(
  context: Awaited<ReturnType<typeof createContext>>,
  sourceIdeaId: string,
): Promise<void> {
  const now = new Date();
  const startedAt = new Date(now.getTime() + 1);
  const completedAt = new Date(now.getTime() + 2);
  const runId = randomUUID();
  const attemptId = randomUUID();
  const contentId = randomUUID();
  const document = { schemaVersion: 1 as const, script: { text: "Seeded script." } };

  await database.transaction(async (transaction) => {
    await transaction.insert(schema.aiRuns).values({
      id: runId,
      workspaceId: context.workspace.id,
      kind: "CONTENT_SCRIPT_GENERATION",
      provider: "avalai",
      model: "gpt-5.6-luna",
      promptVersion: "content-script-generation/v1",
      generationSettings: contentScriptGenerationSettings,
      status: "COMPLETED",
      outputSnapshot: document,
      createdAt: now,
      startedAt,
      completedAt,
    });
    await transaction.insert(schema.contentGenerationAttempts).values({
      id: attemptId,
      workspaceId: context.workspace.id,
      sourceIdeaId,
      contentDnaVersionId: context.contentDnaVersionId,
      requestedLanguage: "en",
      format: "SHORT_VIDEO",
      idempotencyKey: randomUUID(),
      requestFingerprint: "a".repeat(64),
      aiRunId: runId,
      status: "COMPLETED",
      createdAt: now,
      startedAt,
      completedAt,
    });
    await transaction.insert(schema.contents).values({
      id: contentId,
      workspaceId: context.workspace.id,
      sourceIdeaId,
      contentLanguage: "en",
      format: "SHORT_VIDEO",
      sourceGenerationAttemptId: attemptId,
      createdAt: completedAt,
    });
    await transaction.insert(schema.contentDrafts).values({
      contentId,
      document,
      revision: 1,
      createdAt: completedAt,
      updatedAt: completedAt,
    });
    await transaction.insert(schema.contentVersions).values({
      id: randomUUID(),
      contentId,
      versionNumber: 1,
      document,
      source: "AI_GENERATED",
      aiRunId: runId,
      createdByUserId: context.user.id,
      createdAt: completedAt,
    });
    await transaction.insert(schema.workspaceContentGenerationQuotaReservations).values({
      workspaceId: context.workspace.id,
      attemptId,
      reservedAt: now,
      invokedAt: startedAt,
    });
  });
}

function library(context: Awaited<ReturnType<typeof createContext>>) {
  return createIdeaLibraryApplicationService({
    database,
    getAuthenticatedUserId: async () => context.user.id,
    logger: logger(),
  });
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

describe("Idea Library application read", () => {
  it("intersects status and owned generation-run filters across batches", async () => {
    const context = await createContext();
    const { first, second } = await generateTwoBatches(context);

    for (const batch of [first.batch, second.batch]) {
      await database
        .update(schema.ideas)
        .set({ status: "SAVED" })
        .where(and(eq(schema.ideas.batchId, batch.id), eq(schema.ideas.position, 1)));
      await database
        .update(schema.ideas)
        .set({ status: "ACCEPTED" })
        .where(and(eq(schema.ideas.batchId, batch.id), eq(schema.ideas.position, 2)));
      await database
        .update(schema.ideas)
        .set({ status: "REJECTED", rejectionReason: "Already covered" })
        .where(and(eq(schema.ideas.batchId, batch.id), eq(schema.ideas.position, 3)));
    }

    const reads = library(context);
    const input = (
      statusFilter: "ALL" | "NEW" | "SAVED" | "ACCEPTED" | "REJECTED",
      generationBatchId: string | null,
    ) => ({
      workspaceId: context.workspace.id,
      statusFilter,
      generationBatchId,
    });

    const newIdeas = await reads.getIdeaLibrary(input("NEW", null));
    expect(new Set(newIdeas.ideas.map((idea) => idea.batch.id))).toEqual(
      new Set([first.batch.id, second.batch.id]),
    );
    expect((await reads.getIdeaLibrary(input("SAVED", null))).ideas).toHaveLength(2);
    expect((await reads.getIdeaLibrary(input("ACCEPTED", null))).ideas).toHaveLength(2);
    expect((await reads.getIdeaLibrary(input("REJECTED", null))).ideas).toHaveLength(2);
    expect((await reads.getIdeaLibrary(input("SAVED", first.batch.id))).ideas).toHaveLength(1);
    expect((await reads.getIdeaLibrary(input("ACCEPTED", second.batch.id))).ideas).toHaveLength(1);
    expect((await reads.getIdeaLibrary(input("REJECTED", first.batch.id))).ideas).toHaveLength(1);
    expect((await reads.getIdeaLibrary(input("ALL", second.batch.id))).ideas).toHaveLength(20);
  });

  it("derives zero, one, and multiple Content records in the grouped Library query", async () => {
    const context = await createContext();
    const { first } = await generateTwoBatches(context);
    const oneContent = await ideaAt(first.batch.id, 1);
    const multipleContent = await ideaAt(first.batch.id, 2);
    await seedContent(context, oneContent.id);
    await seedContent(context, multipleContent.id);
    await seedContent(context, multipleContent.id);

    const result = await library(context).getIdeaLibrary({
      workspaceId: context.workspace.id,
      statusFilter: "NEW",
      generationBatchId: first.batch.id,
    });
    const counts = new Map(result.ideas.map((idea) => [idea.position, idea.contentCount]));

    expect(counts.get(1)).toBe(1);
    expect(counts.get(2)).toBe(2);
    expect(counts.get(3)).toBe(0);
    expect(result.ideas.every((idea) => !("USED" in idea) && !("isUsed" in idea))).toBe(true);
  });

  it("normalizes malformed and foreign batch IDs to All runs without disclosure", async () => {
    const owner = await createContext();
    const foreignContext = await createContext();
    const { first: ownerBatch } = await generateTwoBatches(owner);
    const { first: foreignBatch } = await generateTwoBatches(foreignContext);

    const reads = library(owner);
    const allRuns = await reads.getIdeaLibrary({
      workspaceId: owner.workspace.id,
      statusFilter: "NEW",
      generationBatchId: null,
    });
    const foreignBatchResult = await reads.getIdeaLibrary({
      workspaceId: owner.workspace.id,
      statusFilter: "NEW",
      generationBatchId: foreignBatch.batch.id,
    });
    const malformed = await reads.getIdeaLibrary({
      workspaceId: owner.workspace.id,
      statusFilter: "NEW",
      generationBatchId: "not-a-uuid",
    });

    expect(foreignBatchResult.generationBatchId).toBeNull();
    expect(malformed.generationBatchId).toBeNull();
    expect(foreignBatchResult.ideas.map((idea) => idea.id)).toEqual(
      allRuns.ideas.map((idea) => idea.id),
    );
    expect(malformed.ideas.map((idea) => idea.id)).toEqual(allRuns.ideas.map((idea) => idea.id));
    expect(foreignBatchResult.ideas.some((idea) => idea.batchId === foreignBatch.batch.id)).toBe(
      false,
    );
    expect(allRuns.ideas.some((idea) => idea.batchId === ownerBatch.batch.id)).toBe(true);
  });
});
