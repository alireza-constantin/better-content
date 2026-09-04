import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import {
  parseContentDnaPayload,
  type ContentDnaPayload,
} from "@/modules/dna/domain/content-dna-payload";
import { createIdeaDecisionApplicationService } from "@/modules/ideas/application/idea-decision-service";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/server", () => ({ getServerSession: vi.fn() }));

import { createProductionQueueApplicationService } from "./production-queue-service";
import { listProductionQueueRecords } from "./production-queue-repository";
import { contentScriptGenerationSettings } from "./content-generation-repository";
import { createContentReadApplicationService } from "./content-read-service";

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });

const readyPayload: ContentDnaPayload = parseContentDnaPayload({
  schemaVersion: 1,
  identity: { creatorOrBrandDescription: "A practical creator." },
  audience: { targetAudienceDescription: "Creators who want useful scripts." },
  expertise: { primaryTopics: ["Content strategy"] },
  voice: { toneTraits: ["Practical"] },
  goals: { contentGoals: ["Teach creators"] },
  language: { defaultContentLanguage: "en", contentLanguages: ["en", "fa"] },
});

const generationSettings = {
  structuredOutput: { schemaName: "idea_generation_v1", schemaVersion: 1 },
  reasoningEffort: "medium",
  maxOutputTokens: 16_000,
  timeoutSeconds: 60,
  retryPolicy: { maxRetries: 0 },
  serviceTier: "default",
} as const;

async function createFixture() {
  const [user] = await database
    .insert(schema.user)
    .values({ id: randomUUID(), name: "Queue Creator", email: `${randomUUID()}@example.test` })
    .returning();
  if (!user) throw new Error("The queue test user was not created.");

  const [workspace] = await database
    .insert(schema.workspaces)
    .values({ name: "Queue workspace" })
    .returning();
  if (!workspace) throw new Error("The queue test workspace was not created.");
  await database
    .insert(schema.workspaceMembers)
    .values({ workspaceId: workspace.id, userId: user.id, role: "owner" });

  const dnaId = randomUUID();
  const dnaVersionId = randomUUID();
  await database.transaction(async (transaction) => {
    await transaction.insert(schema.contentDna).values({
      id: dnaId,
      workspaceId: workspace.id,
      currentVersionId: dnaVersionId,
    });
    await transaction.insert(schema.contentDnaVersions).values({
      id: dnaVersionId,
      contentDnaId: dnaId,
      versionNumber: 1,
      payload: readyPayload,
      createdByUserId: user.id,
    });
  });

  return { user, workspace, dnaVersionId };
}

async function createIdea(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  title: string,
  status: "NEW" | "SAVED" | "ACCEPTED" | "REJECTED" = "ACCEPTED",
) {
  const runId = randomUUID();
  await database.insert(schema.aiRuns).values({
    id: runId,
    workspaceId: fixture.workspace.id,
    kind: "IDEA_GENERATION",
    provider: "avalai",
    model: "gpt-5.6-luna",
    promptVersion: "idea-generation/v1",
    generationSettings,
    status: "COMPLETED",
    outputSnapshot: { schemaVersion: 1, ideas: [] },
    createdAt: new Date("2026-09-01T10:00:00.000Z"),
    startedAt: new Date("2026-09-01T10:00:30.000Z"),
    completedAt: new Date("2026-09-01T10:01:00.000Z"),
  });
  const batchId = randomUUID();
  await database.insert(schema.ideaGenerationBatches).values({
    id: batchId,
    workspaceId: fixture.workspace.id,
    contentDnaVersionId: fixture.dnaVersionId,
    aiRunId: runId,
    idempotencyKey: randomUUID(),
    requestFingerprint: "a".repeat(64),
    requestedLanguage: "en",
    requestedCount: 20,
    status: "COMPLETED",
    createdAt: new Date("2026-09-01T10:00:00.000Z"),
    startedAt: new Date("2026-09-01T10:00:30.000Z"),
    completedAt: new Date("2026-09-01T10:01:00.000Z"),
  });
  const [idea] = await database
    .insert(schema.ideas)
    .values({
      id: randomUUID(),
      batchId,
      position: 1,
      title,
      description: `${title} description`,
      language: "en",
      status,
    })
    .returning();
  if (!idea) throw new Error("The queue test Idea was not created.");
  return idea;
}

async function addContent(fixture: Awaited<ReturnType<typeof createFixture>>, ideaId: string) {
  const runId = randomUUID();
  const attemptId = randomUUID();
  const contentId = randomUUID();
  const now = new Date("2026-09-01T11:00:00.000Z");
  const document = { schemaVersion: 1, script: { text: "Generated" } } as const;
  return database.transaction(async (transaction) => {
    await transaction.insert(schema.aiRuns).values({
      id: runId,
      workspaceId: fixture.workspace.id,
      kind: "CONTENT_SCRIPT_GENERATION",
      provider: "avalai",
      model: "gpt-5.6-luna",
      promptVersion: "content-script-generation/v1",
      generationSettings: contentScriptGenerationSettings,
      status: "PENDING",
      createdAt: now,
    });
    await transaction.insert(schema.contentGenerationAttempts).values({
      id: attemptId,
      workspaceId: fixture.workspace.id,
      sourceIdeaId: ideaId,
      contentDnaVersionId: fixture.dnaVersionId,
      requestedLanguage: "en",
      format: "SHORT_VIDEO",
      idempotencyKey: randomUUID(),
      requestFingerprint: "b".repeat(64),
      aiRunId: runId,
      status: "PENDING",
      createdAt: now,
    });
    await transaction
      .update(schema.aiRuns)
      .set({ status: "RUNNING", startedAt: now })
      .where(eq(schema.aiRuns.id, runId));
    await transaction
      .update(schema.contentGenerationAttempts)
      .set({ status: "RUNNING", startedAt: now })
      .where(eq(schema.contentGenerationAttempts.id, attemptId));
    const [content] = await transaction
      .insert(schema.contents)
      .values({
        id: contentId,
        workspaceId: fixture.workspace.id,
        sourceIdeaId: ideaId,
        contentLanguage: "en",
        format: "SHORT_VIDEO",
        sourceGenerationAttemptId: attemptId,
        createdAt: now,
      })
      .returning();
    if (!content) throw new Error("The queue test Content was not created.");
    await transaction.insert(schema.contentDrafts).values({
      contentId,
      document,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(schema.contentVersions).values({
      contentId,
      versionNumber: 1,
      document,
      source: "AI_GENERATED",
      aiRunId: runId,
      createdByUserId: fixture.user.id,
      createdAt: now,
    });
    await transaction
      .update(schema.aiRuns)
      .set({
        status: "COMPLETED",
        outputSnapshot: document,
        startedAt: now,
        completedAt: now,
      })
      .where(eq(schema.aiRuns.id, runId));
    await transaction
      .update(schema.contentGenerationAttempts)
      .set({
        status: "COMPLETED",
        startedAt: now,
        completedAt: now,
      })
      .where(eq(schema.contentGenerationAttempts.id, attemptId));
    return content;
  });
}

beforeAll(async () => migrate(database, { migrationsFolder: "drizzle" }));

beforeEach(async () => {
  await database.execute(
    'TRUNCATE TABLE "workspace_content_generation_quota_reservations", "content_versions", "content_drafts", "contents", "content_generation_attempts", "workspace_generation_quota_reservations", "ideas", "idea_generation_batches", "ai_runs", "content_dna_versions", "content_dna", "workspace_members", "workspaces", "user" CASCADE',
  );
});

afterAll(async () => pool.end());

describe("production queue persistence and membership", () => {
  it("backfills only eligible Ideas in workspace-local batch/position/ID order", async () => {
    const fixture = await createFixture();
    const laterBatchIdea = await createIdea(fixture, "Later batch");
    const earlierBatchIdea = await createIdea(fixture, "Earlier batch");
    await database
      .update(schema.ideaGenerationBatches)
      .set({
        createdAt: new Date("2026-09-01T12:00:00.000Z"),
        startedAt: new Date("2026-09-01T12:00:30.000Z"),
        completedAt: new Date("2026-09-01T12:01:00.000Z"),
      })
      .where(eq(schema.ideaGenerationBatches.id, laterBatchIdea.batchId));
    await database
      .update(schema.ideaGenerationBatches)
      .set({
        createdAt: new Date("2026-09-01T11:00:00.000Z"),
        startedAt: new Date("2026-09-01T11:00:30.000Z"),
        completedAt: new Date("2026-09-01T11:01:00.000Z"),
      })
      .where(eq(schema.ideaGenerationBatches.id, earlierBatchIdea.batchId));

    await database.execute(sql`
      WITH eligible_ideas AS (
        SELECT i.id,
          row_number() OVER (
            PARTITION BY b.workspace_id
            ORDER BY b.created_at ASC, i.position ASC, i.id ASC
          )::integer AS seeded_position
        FROM ideas i
        INNER JOIN idea_generation_batches b ON b.id = i.batch_id
        WHERE i.status = 'ACCEPTED'
          AND NOT EXISTS (
            SELECT 1 FROM contents c WHERE c.source_idea_id = i.id
          )
      )
      UPDATE ideas i
      SET production_queue_position = eligible_ideas.seeded_position
      FROM eligible_ideas
      WHERE i.id = eligible_ideas.id
    `);

    const queue = await listProductionQueueRecords(database, fixture.workspace.id);
    expect(queue.map((record) => record.idea.id)).toEqual([earlierBatchIdea.id, laterBatchIdea.id]);
    expect(queue.map((record) => record.idea.productionQueuePosition)).toEqual([1, 2]);
  });

  it("reads only authoritative eligible Ideas and never treats position alone as membership", async () => {
    const fixture = await createFixture();
    const queued = await createIdea(fixture, "Queued");
    const withContent = await createIdea(fixture, "Already produced");
    const saved = await createIdea(fixture, "Saved", "SAVED");
    await addContent(fixture, withContent.id);
    await database
      .update(schema.ideas)
      .set({ productionQueuePosition: 1 })
      .where(eq(schema.ideas.id, queued.id));
    await database
      .update(schema.ideas)
      .set({ productionQueuePosition: 77 })
      .where(eq(schema.ideas.id, withContent.id));
    await database
      .update(schema.ideas)
      .set({ productionQueuePosition: 78 })
      .where(eq(schema.ideas.id, saved.id));

    const service = createProductionQueueApplicationService({
      database,
      getAuthenticatedUserId: async () => fixture.user.id,
    });
    await expect(
      service.getProductionQueue({ workspaceId: fixture.workspace.id }),
    ).resolves.toMatchObject([{ id: queued.id, productionQueuePosition: 1, lastAttempt: null }]);
    await expect(listProductionQueueRecords(database, fixture.workspace.id)).resolves.toHaveLength(
      1,
    );
  });

  it("rejects duplicate, missing, stale, and foreign order submissions without partial updates", async () => {
    const fixture = await createFixture();
    const first = await createIdea(fixture, "First");
    const second = await createIdea(fixture, "Second");
    await database
      .update(schema.ideas)
      .set({ productionQueuePosition: 1 })
      .where(eq(schema.ideas.id, first.id));
    await database
      .update(schema.ideas)
      .set({ productionQueuePosition: 2 })
      .where(eq(schema.ideas.id, second.id));
    const service = createProductionQueueApplicationService({
      database,
      getAuthenticatedUserId: async () => fixture.user.id,
    });

    await expect(
      service.reorderProductionQueue({
        workspaceId: fixture.workspace.id,
        orderedIdeaIds: [second.id, first.id],
      }),
    ).resolves.toMatchObject([
      { id: second.id, productionQueuePosition: 1 },
      { id: first.id, productionQueuePosition: 2 },
    ]);
    await expect(
      service.reorderProductionQueue({
        workspaceId: fixture.workspace.id,
        orderedIdeaIds: [first.id, first.id],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.reorderProductionQueue({
        workspaceId: fixture.workspace.id,
        orderedIdeaIds: [first.id],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.reorderProductionQueue({
        workspaceId: fixture.workspace.id,
        orderedIdeaIds: [first.id, randomUUID()],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const stored = await database
      .select({ id: schema.ideas.id, position: schema.ideas.productionQueuePosition })
      .from(schema.ideas)
      .where(eq(schema.ideas.id, second.id));
    expect(stored[0]?.position).toBe(1);
  });
});

describe("production queue entry and exit", () => {
  it("appends acceptance, clears Saved/Rejected exits, and serializes concurrent accepts", async () => {
    const fixture = await createFixture();
    const first = await createIdea(fixture, "First", "NEW");
    const second = await createIdea(fixture, "Second", "NEW");
    const decisions = createIdeaDecisionApplicationService({
      database,
      getAuthenticatedUserId: async () => fixture.user.id,
    });

    await Promise.all([
      decisions.updateIdeaDecision({
        workspaceId: fixture.workspace.id,
        ideaId: first.id,
        nextState: "ACCEPTED",
      }),
      decisions.updateIdeaDecision({
        workspaceId: fixture.workspace.id,
        ideaId: second.id,
        nextState: "ACCEPTED",
      }),
    ]);
    const accepted = await database
      .select({ id: schema.ideas.id, position: schema.ideas.productionQueuePosition })
      .from(schema.ideas)
      .where(eq(schema.ideas.batchId, first.batchId));
    expect(accepted[0]?.position).toBeGreaterThan(0);
    const queue = await listProductionQueueRecords(database, fixture.workspace.id);
    expect(queue.map((record) => record.idea.id).sort()).toEqual([first.id, second.id].sort());
    expect(new Set(queue.map((record) => record.idea.productionQueuePosition)).size).toBe(2);

    await decisions.updateIdeaDecision({
      workspaceId: fixture.workspace.id,
      ideaId: first.id,
      nextState: "SAVED",
    });
    const [saved] = await database
      .select({ position: schema.ideas.productionQueuePosition })
      .from(schema.ideas)
      .where(eq(schema.ideas.id, first.id));
    expect(saved?.position).toBeNull();
    await decisions.updateIdeaDecision({
      workspaceId: fixture.workspace.id,
      ideaId: first.id,
      nextState: "ACCEPTED",
    });
    const [reaccepted] = await database
      .select({ position: schema.ideas.productionQueuePosition })
      .from(schema.ideas)
      .where(eq(schema.ideas.id, first.id));
    expect(reaccepted?.position).toBeGreaterThan(0);
    await decisions.updateIdeaDecision({
      workspaceId: fixture.workspace.id,
      ideaId: first.id,
      nextState: "REJECTED",
      rejectionReason: "Not now",
    });
    const [rejected] = await database
      .select({ position: schema.ideas.productionQueuePosition })
      .from(schema.ideas)
      .where(eq(schema.ideas.id, first.id));
    expect(rejected?.position).toBeNull();
  });
});

describe("Content-by-Idea context", () => {
  it("returns zero, one, and multiple linked Content records without disclosing foreign Ideas", async () => {
    const fixture = await createFixture();
    const idea = await createIdea(fixture, "Source context");
    const reads = createContentReadApplicationService({
      database,
      getAuthenticatedUserId: async () => fixture.user.id,
    });

    await expect(
      reads.getContentByIdea({ workspaceId: fixture.workspace.id, sourceIdeaId: idea.id }),
    ).resolves.toMatchObject({
      sourceIdea: { id: idea.id, title: "Source context", language: "en", status: "ACCEPTED" },
      content: [],
      history: { isUsed: false, attempts: [] },
    });
    await addContent(fixture, idea.id);
    await addContent(fixture, idea.id);
    await expect(
      reads.getContentByIdea({ workspaceId: fixture.workspace.id, sourceIdeaId: idea.id }),
    ).resolves.toMatchObject({
      content: [{ sourceIdea: { id: idea.id } }, { sourceIdea: { id: idea.id } }],
      history: { isUsed: true, attempts: [{ status: "COMPLETED" }, { status: "COMPLETED" }] },
    });

    const foreign = await createFixture();
    const foreignIdea = await createIdea(foreign, "Foreign source");
    await expect(
      reads.getContentByIdea({ workspaceId: fixture.workspace.id, sourceIdeaId: foreignIdea.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
