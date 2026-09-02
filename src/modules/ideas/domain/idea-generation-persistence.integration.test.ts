import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import type { GenerationSettings } from "@/modules/ai/domain/ai-contracts";
import { parseContentDnaPayload } from "@/modules/dna/domain/content-dna-payload";
import type { CanonicalIdeaGenerationOutput } from "./idea-generation-contracts";

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });

const generationSettings: GenerationSettings = {
  structuredOutput: { schemaName: "idea_generation_v1", schemaVersion: 1 },
  reasoningEffort: "medium",
  maxOutputTokens: 16_000,
  timeoutSeconds: 60,
  retryPolicy: { maxRetries: 0 },
  serviceTier: "default",
};

const outputSnapshot: CanonicalIdeaGenerationOutput = {
  schemaVersion: 1,
  ideas: Array.from({ length: 20 }, (_, index) => ({
    title: `Idea ${index + 1}`,
    description: `Description ${index + 1}`,
    category: "Education",
  })),
};

const requestFingerprint = "a".repeat(64);

async function createUser(email = `${randomUUID()}@example.com`) {
  const [createdUser] = await database
    .insert(schema.user)
    .values({ id: randomUUID(), name: "Creator", email })
    .returning();

  if (!createdUser) {
    throw new Error("Test user creation did not return a user.");
  }

  return createdUser;
}

async function createWorkspace() {
  const [workspace] = await database
    .insert(schema.workspaces)
    .values({ name: "Workspace" })
    .returning();

  if (!workspace) {
    throw new Error("Test workspace creation did not return a workspace.");
  }

  return workspace;
}

async function createDnaVersion(workspaceId: string, userId: string): Promise<string> {
  const contentDnaId = randomUUID();
  const versionId = randomUUID();

  await database.transaction(async (transaction) => {
    await transaction.insert(schema.contentDna).values({
      id: contentDnaId,
      workspaceId,
      currentVersionId: versionId,
    });
    await transaction.insert(schema.contentDnaVersions).values({
      id: versionId,
      contentDnaId,
      versionNumber: 1,
      payload: parseContentDnaPayload({
        schemaVersion: 1,
        identity: { creatorOrBrandDescription: "Creator" },
      }),
      createdByUserId: userId,
    });
  });

  return versionId;
}

async function createContext() {
  const user = await createUser();
  const workspace = await createWorkspace();
  const contentDnaVersionId = await createDnaVersion(workspace.id, user.id);

  return { user, workspace, contentDnaVersionId };
}

async function createAiRun(
  workspaceId: string,
  overrides: Partial<typeof schema.aiRuns.$inferInsert> = {},
) {
  const [run] = await database
    .insert(schema.aiRuns)
    .values({
      id: randomUUID(),
      workspaceId,
      kind: "IDEA_GENERATION",
      provider: "openai",
      model: "gpt-5.6-terra",
      promptVersion: "idea-generation/v1",
      generationSettings,
      status: "PENDING",
      ...overrides,
    })
    .returning();

  if (!run) {
    throw new Error("Test AI run creation did not return a run.");
  }

  return run;
}

async function createBatch(
  workspaceId: string,
  contentDnaVersionId: string,
  overrides: Partial<typeof schema.ideaGenerationBatches.$inferInsert> = {},
) {
  const run = await createAiRun(workspaceId);
  const [batch] = await database
    .insert(schema.ideaGenerationBatches)
    .values({
      id: randomUUID(),
      workspaceId,
      contentDnaVersionId,
      aiRunId: run.id,
      idempotencyKey: randomUUID(),
      requestFingerprint,
      requestedLanguage: "en",
      requestedCount: 20,
      status: "PENDING",
      ...overrides,
    })
    .returning();

  if (!batch) {
    throw new Error("Test batch creation did not return a batch.");
  }

  return { run, batch };
}

async function createIdea(
  batchId: string,
  overrides: Partial<typeof schema.ideas.$inferInsert> = {},
) {
  const [idea] = await database
    .insert(schema.ideas)
    .values({
      id: randomUUID(),
      batchId,
      position: 1,
      title: "A generated idea",
      description: "A generated description",
      language: "en",
      ...overrides,
    })
    .returning();

  if (!idea) {
    throw new Error("Test idea creation did not return an idea.");
  }

  return idea;
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

describe("Phase 3 persistence migration", () => {
  it("applies the migration and exposes the reviewed relational constraints", async () => {
    const tables = await database.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('ai_runs', 'idea_generation_batches', 'ideas', 'workspace_generation_quota_reservations')
      ORDER BY table_name
    `);
    const compositeForeignKey = await database.execute(sql`
      SELECT conname, conkey::text, confkey::text
      FROM pg_constraint
      WHERE conname = 'idea_generation_batches_workspace_ai_run_fk'
    `);
    const historyIndex = await database.execute(sql`
      SELECT indexdef
      FROM pg_indexes
      WHERE indexname = 'idea_generation_batches_workspace_created_at_idx'
    `);

    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "ai_runs",
      "idea_generation_batches",
      "ideas",
      "workspace_generation_quota_reservations",
    ]);
    expect(compositeForeignKey.rows).toHaveLength(1);
    expect(historyIndex.rows[0]?.indexdef).toContain("created_at DESC");
  });

  it("allows a batch to reference its workspace's run and rejects a cross-workspace run", async () => {
    const first = await createContext();
    const second = await createContext();
    const firstRun = await createAiRun(first.workspace.id);

    const [batch] = await database
      .insert(schema.ideaGenerationBatches)
      .values({
        workspaceId: first.workspace.id,
        contentDnaVersionId: first.contentDnaVersionId,
        aiRunId: firstRun.id,
        idempotencyKey: randomUUID(),
        requestFingerprint,
        requestedLanguage: "en",
        requestedCount: 20,
        status: "PENDING",
      })
      .returning();

    expect(batch?.aiRunId).toBe(firstRun.id);
    await expect(
      database.insert(schema.ideaGenerationBatches).values({
        workspaceId: second.workspace.id,
        contentDnaVersionId: second.contentDnaVersionId,
        aiRunId: firstRun.id,
        idempotencyKey: randomUUID(),
        requestFingerprint,
        requestedLanguage: "en",
        requestedCount: 20,
        status: "PENDING",
      }),
    ).rejects.toThrow();
  });

  it("enforces one batch per run and workspace-scoped idempotency", async () => {
    const first = await createContext();
    const second = await createContext();
    const sharedKey = randomUUID();
    const firstRun = await createAiRun(first.workspace.id);

    await database.insert(schema.ideaGenerationBatches).values({
      workspaceId: first.workspace.id,
      contentDnaVersionId: first.contentDnaVersionId,
      aiRunId: firstRun.id,
      idempotencyKey: sharedKey,
      requestFingerprint,
      requestedLanguage: "en",
      requestedCount: 20,
      status: "PENDING",
    });

    await expect(
      database.insert(schema.ideaGenerationBatches).values({
        workspaceId: first.workspace.id,
        contentDnaVersionId: first.contentDnaVersionId,
        aiRunId: firstRun.id,
        idempotencyKey: randomUUID(),
        requestFingerprint,
        requestedLanguage: "en",
        requestedCount: 20,
        status: "PENDING",
      }),
    ).rejects.toThrow();

    await expect(
      database.insert(schema.ideaGenerationBatches).values({
        workspaceId: first.workspace.id,
        contentDnaVersionId: first.contentDnaVersionId,
        aiRunId: await createAiRun(first.workspace.id).then((run) => run.id),
        idempotencyKey: sharedKey,
        requestFingerprint,
        requestedLanguage: "en",
        requestedCount: 20,
        status: "PENDING",
      }),
    ).rejects.toThrow();

    const secondRun = await createAiRun(second.workspace.id);
    await expect(
      database.insert(schema.ideaGenerationBatches).values({
        workspaceId: second.workspace.id,
        contentDnaVersionId: second.contentDnaVersionId,
        aiRunId: secondRun.id,
        idempotencyKey: sharedKey,
        requestFingerprint,
        requestedLanguage: "en",
        requestedCount: 20,
        status: "PENDING",
      }),
    ).resolves.toMatchObject({ command: "INSERT" });
  });

  it("enforces fixed count, language, lifecycle, error, and fingerprint values", async () => {
    const context = await createContext();

    await expect(
      createBatch(context.workspace.id, context.contentDnaVersionId, { requestedCount: 19 }),
    ).rejects.toThrow();
    const languageBatch = await createBatch(context.workspace.id, context.contentDnaVersionId);
    await expect(
      database.execute(sql`
        UPDATE idea_generation_batches
        SET requested_language = 'fr'
        WHERE id = ${languageBatch.batch.id}
      `),
    ).rejects.toThrow();
    await expect(
      createBatch(context.workspace.id, context.contentDnaVersionId, { status: "INVALID" }),
    ).rejects.toThrow();
    await expect(
      createBatch(context.workspace.id, context.contentDnaVersionId, {
        status: "FAILED",
        failedAt: new Date(),
        errorCategory: "NOT_SAFE",
      }),
    ).rejects.toThrow();
    await expect(
      createBatch(context.workspace.id, context.contentDnaVersionId, {
        requestFingerprint: "not-a-sha256-fingerprint",
      }),
    ).rejects.toThrow();
  });

  it("keeps ideas workspace-free, position-scoped, and decision-status constrained", async () => {
    const context = await createContext();
    const { batch } = await createBatch(context.workspace.id, context.contentDnaVersionId);
    const columns = await database.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ideas'
    `);

    expect(columns.rows.map((row) => row.column_name)).not.toContain("workspace_id");
    await createIdea(batch.id);
    await expect(createIdea(batch.id, { position: 1 })).rejects.toThrow();
    await expect(createIdea(batch.id, { position: 0 })).rejects.toThrow();
    await expect(createIdea(batch.id, { status: "ARCHIVED" })).rejects.toThrow();
  });

  it("prevents generated-field mutation but permits decision updates", async () => {
    const context = await createContext();
    const { batch } = await createBatch(context.workspace.id, context.contentDnaVersionId);
    const idea = await createIdea(batch.id);

    await expect(
      database.update(schema.ideas).set({ title: "Changed" }).where(eq(schema.ideas.id, idea.id)),
    ).rejects.toThrow();

    await database
      .update(schema.ideas)
      .set({ status: "REJECTED", rejectionReason: "Not aligned" })
      .where(eq(schema.ideas.id, idea.id));
    await database
      .update(schema.ideas)
      .set({ status: "SAVED", rejectionReason: null })
      .where(eq(schema.ideas.id, idea.id));

    const [updatedIdea] = await database
      .select({ status: schema.ideas.status, rejectionReason: schema.ideas.rejectionReason })
      .from(schema.ideas)
      .where(eq(schema.ideas.id, idea.id));
    expect(updatedIdea).toEqual({ status: "SAVED", rejectionReason: null });
  });

  it("allows a successful snapshot only on a completed run", async () => {
    const context = await createContext();
    await expect(createAiRun(context.workspace.id, { outputSnapshot })).rejects.toThrow();

    const now = Date.now();
    const run = await createAiRun(context.workspace.id, {
      status: "COMPLETED",
      createdAt: new Date(now - 2_000),
      startedAt: new Date(now - 1_000),
      completedAt: new Date(now),
      outputSnapshot,
    });
    expect(run.outputSnapshot).toEqual(outputSnapshot);
  });

  it("enforces the Content DNA version FK", async () => {
    const context = await createContext();
    const run = await createAiRun(context.workspace.id);

    await expect(
      database.insert(schema.ideaGenerationBatches).values({
        workspaceId: context.workspace.id,
        contentDnaVersionId: randomUUID(),
        aiRunId: run.id,
        idempotencyKey: randomUUID(),
        requestFingerprint,
        requestedLanguage: "en",
        requestedCount: 20,
        status: "PENDING",
      }),
    ).rejects.toThrow();
  });

  it("keeps quota reservations workspace-owned and distinguishes invocation from release", async () => {
    const first = await createContext();
    const second = await createContext();
    const { batch } = await createBatch(first.workspace.id, first.contentDnaVersionId);

    const [reservation] = await database
      .insert(schema.workspaceGenerationQuotaReservations)
      .values({ workspaceId: first.workspace.id, batchId: batch.id })
      .returning();
    expect(reservation?.invokedAt).toBeNull();

    await expect(
      database.insert(schema.workspaceGenerationQuotaReservations).values({
        workspaceId: second.workspace.id,
        batchId: batch.id,
      }),
    ).rejects.toThrow();

    await expect(
      database
        .update(schema.workspaceGenerationQuotaReservations)
        .set({ invokedAt: new Date(), releasedAt: new Date() })
        .where(eq(schema.workspaceGenerationQuotaReservations.id, reservation!.id)),
    ).rejects.toThrow();
  });
});
