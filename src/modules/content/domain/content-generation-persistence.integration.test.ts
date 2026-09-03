import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import { parseContentDnaPayload } from "@/modules/dna/domain/content-dna-payload";

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });

const ideaGenerationSettings = {
  structuredOutput: { schemaName: "idea_generation_v1", schemaVersion: 1 },
  reasoningEffort: "medium",
  maxOutputTokens: 16_000,
  timeoutSeconds: 60,
  retryPolicy: { maxRetries: 0 },
  serviceTier: "default",
} as const;

const contentGenerationSettings = {
  structuredOutput: { schemaName: "content_script_v1", schemaVersion: 1 },
  reasoningEffort: "medium",
  maxOutputTokens: 16_000,
  timeoutSeconds: 90,
  retryPolicy: { maxRetries: 0 },
  serviceTier: "default",
} as const;

const document = { schemaVersion: 1, script: { text: "A useful script." } } as const;
const requestFingerprint = "a".repeat(64);

async function expectImmutableColumn(
  table: string,
  column: string,
  rowIdColumn: string,
  rowId: string,
  value: string | number | Date,
) {
  await expect(
    database.execute(sql`UPDATE ${sql.identifier(table)}
      SET ${sql.identifier(column)} = ${value}
      WHERE ${sql.identifier(rowIdColumn)} = ${rowId}`),
  ).rejects.toThrow();
}

async function createUser(email = `${randomUUID()}@example.com`) {
  const [createdUser] = await database
    .insert(schema.user)
    .values({ id: randomUUID(), name: "Creator", email })
    .returning();

  if (!createdUser) throw new Error("Test user creation did not return a user.");
  return createdUser;
}

async function createWorkspace() {
  const [workspace] = await database
    .insert(schema.workspaces)
    .values({ name: "Workspace" })
    .returning();

  if (!workspace) throw new Error("Test workspace creation did not return a workspace.");
  return workspace;
}

async function createDnaVersion(workspaceId: string, userId: string) {
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

async function createIdea(workspaceId: string, contentDnaVersionId: string) {
  const [run] = await database
    .insert(schema.aiRuns)
    .values({
      id: randomUUID(),
      workspaceId,
      kind: "IDEA_GENERATION",
      provider: "avalai",
      model: "gpt-5.6-luna",
      promptVersion: "idea-generation/v1",
      generationSettings: ideaGenerationSettings,
      status: "PENDING",
    })
    .returning();

  if (!run) throw new Error("Test AI Run creation did not return a run.");

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
    })
    .returning();

  if (!batch) throw new Error("Test idea batch creation did not return a batch.");

  const [idea] = await database
    .insert(schema.ideas)
    .values({
      id: randomUUID(),
      batchId: batch.id,
      position: 1,
      title: "A generated idea",
      description: "A generated description",
      language: "en",
    })
    .returning();

  if (!idea) throw new Error("Test idea creation did not return an idea.");
  return idea;
}

async function createContext() {
  const user = await createUser();
  const workspace = await createWorkspace();
  const contentDnaVersionId = await createDnaVersion(workspace.id, user.id);
  const idea = await createIdea(workspace.id, contentDnaVersionId);
  return { user, workspace, contentDnaVersionId, idea };
}

async function createContentRun(workspaceId: string) {
  const [run] = await database
    .insert(schema.aiRuns)
    .values({
      id: randomUUID(),
      workspaceId,
      kind: "CONTENT_SCRIPT_GENERATION",
      provider: "avalai",
      model: "gpt-5.6-luna",
      promptVersion: "content-script-generation/v1",
      generationSettings: contentGenerationSettings,
      status: "PENDING",
    })
    .returning();

  if (!run) throw new Error("Test Content AI Run creation did not return a run.");
  return run;
}

async function createAttempt(
  context: Awaited<ReturnType<typeof createContext>>,
  overrides: Partial<typeof schema.contentGenerationAttempts.$inferInsert> = {},
) {
  const run = await createContentRun(context.workspace.id);
  const [attempt] = await database
    .insert(schema.contentGenerationAttempts)
    .values({
      id: randomUUID(),
      workspaceId: context.workspace.id,
      sourceIdeaId: context.idea.id,
      contentDnaVersionId: context.contentDnaVersionId,
      requestedLanguage: "en",
      format: "SHORT_VIDEO",
      instructions: "Use a practical example.",
      idempotencyKey: randomUUID(),
      requestFingerprint,
      aiRunId: run.id,
      status: "PENDING",
      ...overrides,
    })
    .returning();

  if (!attempt) throw new Error("Test generation Attempt creation did not return an attempt.");
  return { attempt, run };
}

async function createContent(
  context: Awaited<ReturnType<typeof createContext>>,
  attemptId: string,
) {
  const [attempt] = await database
    .select()
    .from(schema.contentGenerationAttempts)
    .where(eq(schema.contentGenerationAttempts.id, attemptId));

  if (!attempt) throw new Error("Test Content creation requires an Attempt.");

  const [content] = await database.transaction(async (transaction) => {
    const now = new Date(attempt.createdAt.getTime() + 1_000);
    await transaction
      .update(schema.aiRuns)
      .set({ status: "RUNNING", startedAt: now })
      .where(eq(schema.aiRuns.id, attempt.aiRunId));
    await transaction
      .update(schema.contentGenerationAttempts)
      .set({ status: "RUNNING", startedAt: now })
      .where(eq(schema.contentGenerationAttempts.id, attempt.id));
    await transaction
      .update(schema.aiRuns)
      .set({ status: "COMPLETED", completedAt: now, outputSnapshot: document })
      .where(eq(schema.aiRuns.id, attempt.aiRunId));
    await transaction
      .update(schema.contentGenerationAttempts)
      .set({ status: "COMPLETED", completedAt: now })
      .where(eq(schema.contentGenerationAttempts.id, attempt.id));

    const [content] = await transaction
      .insert(schema.contents)
      .values({
        id: randomUUID(),
        workspaceId: context.workspace.id,
        sourceIdeaId: context.idea.id,
        contentLanguage: "en",
        format: "SHORT_VIDEO",
        sourceGenerationAttemptId: attemptId,
      })
      .returning();

    if (!content) throw new Error("Test Content creation did not return Content.");

    await transaction
      .insert(schema.contentDrafts)
      .values({ contentId: content.id, document, revision: 1 });
    await transaction.insert(schema.contentVersions).values({
      id: randomUUID(),
      contentId: content.id,
      versionNumber: 1,
      document,
      source: "AI_GENERATED",
      aiRunId: attempt.aiRunId,
      createdByUserId: context.user.id,
    });

    return [content];
  });

  return content;
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

describe("Phase 4 Content-generation persistence migration", () => {
  it("exposes only the approved Phase 4 tables and the two acyclic composite lineage keys", async () => {
    const tables = await database.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('content_generation_attempts', 'contents', 'content_drafts', 'content_versions', 'workspace_content_generation_quota_reservations')
      ORDER BY table_name
    `);
    const constraints = await database.execute(sql`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'content_generation_attempts_workspace_ai_run_fk',
        'contents_workspace_source_generation_attempt_fk'
      )
      ORDER BY conname
    `);
    const deferredColumns = await database.execute(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_name IN ('content_generation_attempts', 'contents', 'content_drafts', 'content_versions')
        AND column_name IN ('resulting_content_id', 'accepted_version_id', 'schema_version', 'publication_id')
      ORDER BY table_name, column_name
    `);

    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "content_drafts",
      "content_generation_attempts",
      "content_versions",
      "contents",
      "workspace_content_generation_quota_reservations",
    ]);
    expect(constraints.rows.map((row) => row.conname)).toEqual([
      "content_generation_attempts_workspace_ai_run_fk",
      "contents_workspace_source_generation_attempt_fk",
    ]);
    expect(deferredColumns.rows).toEqual([]);
  });

  it("rejects cross-workspace Attempt/AI Run and Content/Attempt lineage", async () => {
    const first = await createContext();
    const second = await createContext();
    const secondRun = await createContentRun(second.workspace.id);

    await expect(
      database.insert(schema.contentGenerationAttempts).values({
        id: randomUUID(),
        workspaceId: first.workspace.id,
        sourceIdeaId: first.idea.id,
        contentDnaVersionId: first.contentDnaVersionId,
        requestedLanguage: "en",
        format: "SHORT_VIDEO",
        idempotencyKey: randomUUID(),
        requestFingerprint,
        aiRunId: secondRun.id,
        status: "PENDING",
      }),
    ).rejects.toThrow();

    const { attempt } = await createAttempt(second);
    await expect(
      database.insert(schema.contents).values({
        id: randomUUID(),
        workspaceId: first.workspace.id,
        sourceIdeaId: first.idea.id,
        contentLanguage: "en",
        format: "SHORT_VIDEO",
        sourceGenerationAttemptId: attempt.id,
      }),
    ).rejects.toThrow();
  });

  it("enforces one Draft, one Content result per Attempt, and sequential generated versions", async () => {
    const context = await createContext();
    const { attempt } = await createAttempt(context);
    const content = await createContent(context, attempt.id);

    await expect(
      database
        .insert(schema.contentDrafts)
        .values({ contentId: content.id, document, revision: 1 }),
    ).rejects.toThrow();

    await expect(
      database.insert(schema.contents).values({
        id: randomUUID(),
        workspaceId: context.workspace.id,
        sourceIdeaId: context.idea.id,
        contentLanguage: "fa",
        format: "LONG_VIDEO",
        sourceGenerationAttemptId: attempt.id,
      }),
    ).rejects.toThrow();

    await expect(
      database.insert(schema.contentVersions).values({
        id: randomUUID(),
        contentId: content.id,
        versionNumber: 1,
        document,
        source: "AI_GENERATED",
        aiRunId: randomUUID(),
        createdByUserId: context.user.id,
      }),
    ).rejects.toThrow();
    const unrelatedRun = await createContentRun(context.workspace.id);
    await expect(
      database.insert(schema.contentVersions).values({
        id: randomUUID(),
        contentId: content.id,
        versionNumber: 2,
        document,
        source: "AI_GENERATED",
        aiRunId: unrelatedRun.id,
        createdByUserId: context.user.id,
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid content request, lifecycle, document-version, and quota states", async () => {
    const context = await createContext();
    const run = await createContentRun(context.workspace.id);

    await expect(
      database.insert(schema.contentGenerationAttempts).values({
        id: randomUUID(),
        workspaceId: context.workspace.id,
        sourceIdeaId: context.idea.id,
        contentDnaVersionId: context.contentDnaVersionId,
        requestedLanguage: "de" as never,
        format: "ARTICLE" as never,
        idempotencyKey: randomUUID(),
        requestFingerprint: "not-a-fingerprint",
        aiRunId: run.id,
        status: "COMPLETED",
      }),
    ).rejects.toThrow();

    const { attempt } = await createAttempt(context);
    const content = await createContent(context, attempt.id);
    await expect(
      database
        .update(schema.contentDrafts)
        .set({ revision: 0 })
        .where(eq(schema.contentDrafts.contentId, content.id)),
    ).rejects.toThrow();
    await expect(
      database.insert(schema.contentVersions).values({
        id: randomUUID(),
        contentId: content.id,
        versionNumber: 0,
        document,
        source: "MANUAL_CHECKPOINT",
        aiRunId: attempt.aiRunId,
        createdByUserId: context.user.id,
      }),
    ).rejects.toThrow();
    await expect(
      database.insert(schema.workspaceContentGenerationQuotaReservations).values({
        workspaceId: context.workspace.id,
        attemptId: attempt.id,
        invokedAt: new Date(),
        releasedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it("protects immutable Content, Attempt, and Content Version facts while retaining mutable Draft state", async () => {
    const context = await createContext();
    const { attempt } = await createAttempt(context);
    const content = await createContent(context, attempt.id);
    const [version] = await database
      .select()
      .from(schema.contentVersions)
      .where(eq(schema.contentVersions.contentId, content.id));

    if (!version) throw new Error("Test Version creation did not return a version.");

    for (const [column, value] of [
      ["workspace_id", randomUUID()],
      ["source_generation_attempt_id", randomUUID()],
      ["source_idea_id", randomUUID()],
      ["content_language", "fa"],
      ["format", "LONG_VIDEO"],
      ["created_at", new Date()],
    ] as const) {
      await expectImmutableColumn("contents", column, "id", content.id, value);
    }

    for (const [column, value] of [
      ["workspace_id", randomUUID()],
      ["source_idea_id", randomUUID()],
      ["content_dna_version_id", randomUUID()],
      ["requested_language", "fa"],
      ["format", "LONG_VIDEO"],
      ["instructions", "Changed after acceptance."],
      ["idempotency_key", randomUUID()],
      ["request_fingerprint", "b".repeat(64)],
      ["ai_run_id", randomUUID()],
      ["created_at", new Date()],
    ] as const) {
      await expectImmutableColumn("content_generation_attempts", column, "id", attempt.id, value);
    }

    for (const [column, value] of [
      ["id", randomUUID()],
      ["content_id", randomUUID()],
      ["version_number", 2],
      ["source", "AI_GENERATED"],
      ["ai_run_id", randomUUID()],
      ["created_by_user_id", randomUUID()],
      ["created_at", new Date()],
    ] as const) {
      await expectImmutableColumn("content_versions", column, "id", version.id, value);
    }
    await expect(
      database
        .update(schema.contentVersions)
        .set({ document: { schemaVersion: 1, script: { text: "Changed history." } } })
        .where(eq(schema.contentVersions.id, version.id)),
    ).rejects.toThrow();

    await database
      .update(schema.contentDrafts)
      .set({
        document: { schemaVersion: 1, script: { text: "Editable draft." } },
        revision: 2,
        updatedAt: new Date(),
      })
      .where(eq(schema.contentDrafts.contentId, content.id));
    for (const [column, value] of [
      ["content_id", randomUUID()],
      ["created_at", new Date()],
    ] as const) {
      await expectImmutableColumn("content_drafts", column, "content_id", content.id, value);
    }
  });

  it("rejects invalid Content AI Run policy and immutable operational configuration", async () => {
    const context = await createContext();
    await expect(
      database.insert(schema.aiRuns).values({
        id: randomUUID(),
        workspaceId: context.workspace.id,
        kind: "CONTENT_SCRIPT_GENERATION",
        provider: "openai",
        model: "gpt-5.6-terra",
        promptVersion: "content-script-generation/v1",
        generationSettings: contentGenerationSettings,
        status: "PENDING",
      }),
    ).rejects.toThrow();

    const run = await createContentRun(context.workspace.id);
    await expect(
      database
        .update(schema.aiRuns)
        .set({ promptVersion: "idea-generation/v1" })
        .where(eq(schema.aiRuns.id, run.id)),
    ).rejects.toThrow();
    await expect(
      database
        .update(schema.aiRuns)
        .set({ status: "COMPLETED", startedAt: new Date(), completedAt: new Date() })
        .where(eq(schema.aiRuns.id, run.id)),
    ).rejects.toThrow();
  });

  it("requires paired terminal states and exactly one Content result at transaction commit", async () => {
    const context = await createContext();
    const { attempt, run } = await createAttempt(context);
    const now = new Date();

    await expect(
      database
        .update(schema.aiRuns)
        .set({ status: "RUNNING", startedAt: now })
        .where(eq(schema.aiRuns.id, run.id)),
    ).rejects.toThrow();

    await expect(
      database.transaction(async (transaction) => {
        await transaction
          .update(schema.aiRuns)
          .set({ status: "RUNNING", startedAt: now })
          .where(eq(schema.aiRuns.id, run.id));
        await transaction
          .update(schema.contentGenerationAttempts)
          .set({ status: "RUNNING", startedAt: now })
          .where(eq(schema.contentGenerationAttempts.id, attempt.id));
        await transaction
          .update(schema.aiRuns)
          .set({ status: "COMPLETED", completedAt: now, outputSnapshot: document })
          .where(eq(schema.aiRuns.id, run.id));
        await transaction
          .update(schema.contentGenerationAttempts)
          .set({ status: "COMPLETED", completedAt: now })
          .where(eq(schema.contentGenerationAttempts.id, attempt.id));
      }),
    ).rejects.toThrow();
  });

  it("keeps Content quota storage separate and makes workspace idempotency race-safe", async () => {
    const context = await createContext();
    const key = randomUUID();
    const firstRun = await createContentRun(context.workspace.id);
    const secondRun = await createContentRun(context.workspace.id);
    const attemptValues = (aiRunId: string) => ({
      id: randomUUID(),
      workspaceId: context.workspace.id,
      sourceIdeaId: context.idea.id,
      contentDnaVersionId: context.contentDnaVersionId,
      requestedLanguage: "en" as const,
      format: "SHORT_VIDEO" as const,
      idempotencyKey: key,
      requestFingerprint,
      aiRunId,
      status: "PENDING" as const,
    });

    const results = await Promise.allSettled([
      database.insert(schema.contentGenerationAttempts).values(attemptValues(firstRun.id)),
      database.insert(schema.contentGenerationAttempts).values(attemptValues(secondRun.id)),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const [attempt] = await database
      .select()
      .from(schema.contentGenerationAttempts)
      .where(eq(schema.contentGenerationAttempts.idempotencyKey, key));
    if (!attempt) throw new Error("Concurrent insert did not create an Attempt.");

    await database.insert(schema.workspaceContentGenerationQuotaReservations).values({
      workspaceId: context.workspace.id,
      attemptId: attempt.id,
    });
    await database.insert(schema.workspaceGenerationQuotaReservations).values({
      workspaceId: context.workspace.id,
      batchId: context.idea.batchId,
    });
  });
});
