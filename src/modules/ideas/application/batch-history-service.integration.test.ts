import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import { FakeGenerateIdeasProvider } from "@/modules/ai/testing/fake-generate-ideas-provider";
import {
  parseContentDnaPayload,
  type ContentDnaPayload,
} from "@/modules/dna/domain/content-dna-payload";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/server", () => ({ getServerSession: vi.fn() }));

import { createIdeaDecisionApplicationService } from "./idea-decision-service";
import { createIdeaGenerationBatchApplicationService } from "./batch-history-service";
import {
  createIdeaGenerationApplicationService,
  ideaGenerationSettings,
} from "./generation-service";

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

async function createUser(email = `${randomUUID()}@example.com`) {
  const [created] = await database
    .insert(schema.user)
    .values({ id: randomUUID(), name: "Creator", email })
    .returning();

  if (!created) {
    throw new Error("Test user creation did not return a user.");
  }

  return created;
}

async function createWorkspaceForUser(userId: string) {
  const [created] = await database
    .insert(schema.workspaces)
    .values({ name: "Workspace" })
    .returning();

  if (!created) {
    throw new Error("Test workspace creation did not return a workspace.");
  }

  await database.insert(schema.workspaceMembers).values({
    workspaceId: created.id,
    userId,
    role: "owner",
  });

  return created;
}

async function createContext() {
  const user = await createUser();
  const workspace = await createWorkspaceForUser(user.id);
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

  return { user, workspace, contentDnaVersionId };
}

function generationInput(context: Awaited<ReturnType<typeof createContext>>) {
  return {
    workspaceId: context.workspace.id,
    baseContentDnaVersionId: context.contentDnaVersionId,
    requestedLanguage: "en" as const,
    idempotencyKey: randomUUID(),
  };
}

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function countRows(table: typeof schema.ideaGenerationBatches | typeof schema.ideas) {
  const [result] = await database.select({ value: count() }).from(table);

  return Number(result?.value ?? 0);
}

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "drizzle" });
});

beforeEach(async () => {
  await database.execute(
    'TRUNCATE TABLE "workspace_generation_quota_reservations", "ideas", "idea_generation_batches", "ai_runs", "content_dna_versions", "content_dna", "workspace_members", "workspaces", "user" CASCADE',
  );
});

afterAll(async () => {
  await pool.end();
});

describe("idea generation batch application services", () => {
  it("returns newest-first safe history and selects the newest successful batch", async () => {
    const context = await createContext();
    const generation = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => new FakeGenerateIdeasProvider(),
      logger: createLogger(),
    });
    const batches = createIdeaGenerationBatchApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      recoverStaleAttempts: generation.recoverStaleAttempts,
      logger: createLogger(),
    });

    const first = await generation.generateIdeas(generationInput(context));
    const second = await generation.generateIdeas(generationInput(context));
    const history = await batches.getBatchHistory({ workspaceId: context.workspace.id });

    expect(history.batches.map((batch) => batch.id)).toEqual([second.batch.id, first.batch.id]);
    expect(history.batches[0]).toMatchObject({
      status: "COMPLETED",
      contentDnaVersionNumber: 1,
      requestedLanguage: "en",
      requestedCount: 20,
      ideaCount: 20,
    });
    expect(history.selectedBatchId).toBe(second.batch.id);
    expect(JSON.stringify(history)).not.toContain("gpt-5.6");
    expect(JSON.stringify(history)).not.toContain("outputSnapshot");
  });

  it("returns a safe active detail and opportunistically recovers stale work", async () => {
    const context = await createContext();
    const createdAt = new Date("2026-09-01T10:00:00.000Z");
    const batchId = randomUUID();
    const runId = randomUUID();

    await database.transaction(async (transaction) => {
      await transaction.insert(schema.aiRuns).values({
        id: runId,
        workspaceId: context.workspace.id,
        kind: "IDEA_GENERATION",
        provider: "openai",
        model: "gpt-5.6-terra",
        promptVersion: "idea-generation/v1",
        generationSettings: ideaGenerationSettings,
        status: "RUNNING",
        createdAt,
        startedAt: createdAt,
      });
      await transaction.insert(schema.ideaGenerationBatches).values({
        id: batchId,
        workspaceId: context.workspace.id,
        contentDnaVersionId: context.contentDnaVersionId,
        aiRunId: runId,
        idempotencyKey: randomUUID(),
        requestFingerprint: "a".repeat(64),
        requestedLanguage: "en",
        requestedCount: 20,
        status: "RUNNING",
        createdAt,
        startedAt: createdAt,
      });
      await transaction.insert(schema.workspaceGenerationQuotaReservations).values({
        workspaceId: context.workspace.id,
        batchId,
        reservedAt: createdAt,
        invokedAt: createdAt,
      });
    });

    const batches = createIdeaGenerationBatchApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      clock: () => new Date("2026-09-01T10:01:16.000Z"),
      logger: createLogger(),
    });
    const detail = await batches.getBatchDetail({
      workspaceId: context.workspace.id,
      batchId,
    });

    expect(detail).toMatchObject({
      id: batchId,
      status: "FAILED",
      errorCategory: "INTERRUPTED",
      ideaCount: 0,
      ideas: [],
      canRetry: true,
    });
    expect(JSON.stringify(detail)).not.toContain("outputSnapshot");
  });

  it("keeps a newest failed operation selected after a successful batch", async () => {
    const context = await createContext();
    const successfulGeneration = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => new FakeGenerateIdeasProvider(),
      logger: createLogger(),
    });
    await successfulGeneration.generateIdeas(generationInput(context));

    const failedGeneration = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => new FakeGenerateIdeasProvider({ scenario: "invalid-output" }),
      logger: createLogger(),
    });
    await expect(failedGeneration.generateIdeas(generationInput(context))).rejects.toMatchObject({
      code: "AI_OUTPUT_INVALID",
    });

    const batches = createIdeaGenerationBatchApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      logger: createLogger(),
    });
    const history = await batches.getBatchHistory({ workspaceId: context.workspace.id });

    expect(history.batches[0]?.status).toBe("FAILED");
    expect(history.batches[0]?.errorCategory).toBe("INVALID_OUTPUT");
    expect(history.selectedBatchId).toBe(history.batches[0]?.id);
  });

  it("retries a failed batch with a new operation and reuses only safe request facts", async () => {
    const context = await createContext();
    const failedGeneration = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => new FakeGenerateIdeasProvider({ scenario: "provider-unavailable" }),
      logger: createLogger(),
    });
    await expect(failedGeneration.generateIdeas(generationInput(context))).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    const [failedBatch] = await database
      .select()
      .from(schema.ideaGenerationBatches)
      .where(eq(schema.ideaGenerationBatches.workspaceId, context.workspace.id));

    if (!failedBatch) {
      throw new Error("Failed batch was not persisted.");
    }

    const successfulGeneration = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => new FakeGenerateIdeasProvider(),
      logger: createLogger(),
    });
    const batches = createIdeaGenerationBatchApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      generateIdeas: successfulGeneration.generateIdeas,
      recoverStaleAttempts: successfulGeneration.recoverStaleAttempts,
      logger: createLogger(),
    });

    await expect(
      batches.getBatchDetail({ workspaceId: context.workspace.id, batchId: failedBatch.id }),
    ).resolves.toMatchObject({
      status: "FAILED",
      errorCategory: "PROVIDER_UNAVAILABLE",
      ideaCount: 0,
      ideas: [],
      canRetry: true,
    });

    const retry = await batches.retryBatch({
      workspaceId: context.workspace.id,
      batchId: failedBatch.id,
    });

    expect(retry.replayed).toBe(false);
    expect(retry.batch.id).not.toBe(failedBatch.id);
    expect(retry.batch.status).toBe("COMPLETED");
    expect(retry.batch.contentDnaVersionId).toBe(context.contentDnaVersionId);
    expect(await countRows(schema.ideaGenerationBatches)).toBe(2);
    expect(await countRows(schema.ideas)).toBe(20);
  });

  it("authorizes idea decisions through the owning batch and clears reasons atomically", async () => {
    const context = await createContext();
    const generation = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => new FakeGenerateIdeasProvider(),
      logger: createLogger(),
    });
    const generated = await generation.generateIdeas(generationInput(context));
    const [idea] = await database
      .select()
      .from(schema.ideas)
      .where(eq(schema.ideas.batchId, generated.batch.id))
      .limit(1);

    if (!idea) {
      throw new Error("Generated idea was not persisted.");
    }

    const decisions = createIdeaDecisionApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      logger: createLogger(),
    });
    const rejected = await decisions.updateIdeaDecision({
      workspaceId: context.workspace.id,
      ideaId: idea.id,
      nextState: "REJECTED",
      rejectionReason: "Too broad",
    });
    expect(rejected).toMatchObject({
      id: idea.id,
      status: "REJECTED",
      rejectionReason: "Too broad",
      isNoop: false,
    });

    const changedReason = await decisions.updateIdeaDecision({
      workspaceId: context.workspace.id,
      ideaId: idea.id,
      nextState: "REJECTED",
      rejectionReason: "Already covered",
    });
    expect(changedReason).toMatchObject({
      status: "REJECTED",
      rejectionReason: "Already covered",
      isNoop: false,
    });

    const accepted = await decisions.updateIdeaDecision({
      workspaceId: context.workspace.id,
      ideaId: idea.id,
      nextState: "ACCEPTED",
      rejectionReason: "ignored when accepting",
    });
    expect(accepted).toMatchObject({
      id: idea.id,
      status: "ACCEPTED",
      rejectionReason: null,
      isNoop: false,
    });
    expect(accepted.title).toBe(idea.title);
    expect(accepted.description).toBe(idea.description);

    const noop = await decisions.updateIdeaDecision({
      workspaceId: context.workspace.id,
      ideaId: idea.id,
      nextState: "ACCEPTED",
    });
    expect(noop).toMatchObject({ status: "ACCEPTED", isNoop: true });
    expect(noop.statusChangedAt).toEqual(accepted.statusChangedAt);

    await expect(
      decisions.updateIdeaDecision({
        workspaceId: context.workspace.id,
        ideaId: idea.id,
        nextState: "REJECTED",
        rejectionReason: "x".repeat(501),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const saved = await decisions.updateIdeaDecision({
      workspaceId: context.workspace.id,
      ideaId: idea.id,
      nextState: "SAVED",
    });
    const newlyEvaluated = await decisions.updateIdeaDecision({
      workspaceId: context.workspace.id,
      ideaId: idea.id,
      nextState: "NEW",
    });
    expect(saved.status).toBe("SAVED");
    expect(newlyEvaluated.status).toBe("NEW");

    const stored = await database.select().from(schema.ideas).where(eq(schema.ideas.id, idea.id));
    expect(stored[0]).toMatchObject({
      batchId: idea.batchId,
      position: idea.position,
      title: idea.title,
      description: idea.description,
      category: idea.category,
      language: idea.language,
      status: "NEW",
      rejectionReason: null,
    });
  });

  it("does not reveal or mutate foreign batch and idea IDs", async () => {
    const owner = await createContext();
    const other = await createContext();
    const generation = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => owner.user.id,
      providerFactory: () => new FakeGenerateIdeasProvider(),
      logger: createLogger(),
    });
    const generated = await generation.generateIdeas(generationInput(owner));
    const [idea] = await database
      .select()
      .from(schema.ideas)
      .where(eq(schema.ideas.batchId, generated.batch.id))
      .limit(1);

    if (!idea) {
      throw new Error("Generated idea was not persisted.");
    }

    const otherBatches = createIdeaGenerationBatchApplicationService({
      database,
      getAuthenticatedUserId: async () => other.user.id,
      logger: createLogger(),
    });
    const otherDecisions = createIdeaDecisionApplicationService({
      database,
      getAuthenticatedUserId: async () => other.user.id,
      logger: createLogger(),
    });

    await expect(
      otherBatches.getBatchDetail({
        workspaceId: other.workspace.id,
        batchId: generated.batch.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      otherDecisions.updateIdeaDecision({
        workspaceId: other.workspace.id,
        ideaId: idea.id,
        nextState: "SAVED",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      otherBatches.retryBatch({
        workspaceId: other.workspace.id,
        batchId: generated.batch.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(
      await database
        .select({ status: schema.ideas.status })
        .from(schema.ideas)
        .where(eq(schema.ideas.id, idea.id)),
    ).toEqual([{ status: "NEW" }]);
  });
});
