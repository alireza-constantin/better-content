import { randomUUID } from "node:crypto";

import { and, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import { FakeGenerateContentScriptProvider } from "@/modules/ai/testing/fake-generate-content-script-provider";
import {
  parseContentDnaPayload,
  type ContentDnaPayload,
} from "@/modules/dna/domain/content-dna-payload";
import { createContentGenerationApplicationService } from "./content-generation-service";
import { contentScriptGenerationSettings } from "./content-generation-repository";
import { createContentDraftApplicationService } from "./content-draft-service";
import { createContentReadApplicationService } from "./content-read-service";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/server", () => ({ getServerSession: vi.fn() }));

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

const englishOnlyPayload = parseContentDnaPayload({
  ...readyPayload,
  language: { defaultContentLanguage: "en", contentLanguages: ["en"] },
});

const incompletePayload: ContentDnaPayload = parseContentDnaPayload({
  schemaVersion: 1,
  identity: { creatorOrBrandDescription: "A practical creator." },
});

async function createUser() {
  const [created] = await database
    .insert(schema.user)
    .values({ id: randomUUID(), name: "Creator", email: `${randomUUID()}@example.com` })
    .returning();

  if (!created) throw new Error("Test user was not created.");
  return created;
}

async function createWorkspace(userId: string) {
  const [workspace] = await database
    .insert(schema.workspaces)
    .values({ name: "Workspace" })
    .returning();

  if (!workspace) throw new Error("Test workspace was not created.");
  await database.insert(schema.workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: "owner",
  });
  return workspace;
}

async function createDnaVersion(workspaceId: string, userId: string, payload: ContentDnaPayload) {
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
      payload,
      createdByUserId: userId,
    });
  });

  return { contentDnaId, versionId };
}

async function setCurrentDnaVersion(
  dna: { contentDnaId: string },
  userId: string,
  payload: ContentDnaPayload,
  versionNumber: number,
) {
  const versionId = randomUUID();

  await database.transaction(async (transaction) => {
    await transaction.insert(schema.contentDnaVersions).values({
      id: versionId,
      contentDnaId: dna.contentDnaId,
      versionNumber,
      payload,
      createdByUserId: userId,
    });
    await transaction
      .update(schema.contentDna)
      .set({ currentVersionId: versionId })
      .where(eq(schema.contentDna.id, dna.contentDnaId));
  });

  return versionId;
}

async function createIdea(workspaceId: string, dnaVersionId: string, status = "ACCEPTED" as const) {
  const [run] = await database
    .insert(schema.aiRuns)
    .values({
      id: randomUUID(),
      workspaceId,
      kind: "IDEA_GENERATION",
      provider: "avalai",
      model: "gpt-5.6-luna",
      promptVersion: "idea-generation/v1",
      generationSettings: {
        structuredOutput: { schemaName: "idea_generation_v1", schemaVersion: 1 },
        reasoningEffort: "medium",
        maxOutputTokens: 16_000,
        timeoutSeconds: 60,
        retryPolicy: { maxRetries: 0 },
        serviceTier: "default",
      },
      status: "PENDING",
    })
    .returning();

  if (!run) throw new Error("Test Idea AI Run was not created.");
  const [batch] = await database
    .insert(schema.ideaGenerationBatches)
    .values({
      id: randomUUID(),
      workspaceId,
      contentDnaVersionId: dnaVersionId,
      aiRunId: run.id,
      idempotencyKey: randomUUID(),
      requestFingerprint: "a".repeat(64),
      requestedLanguage: "en",
      requestedCount: 20,
      status: "PENDING",
    })
    .returning();

  if (!batch) throw new Error("Test Idea batch was not created.");
  const [idea] = await database
    .insert(schema.ideas)
    .values({
      id: randomUUID(),
      batchId: batch.id,
      position: 1,
      title: "A useful idea",
      description: "A useful description",
      language: "en",
      status,
    })
    .returning();

  if (!idea) throw new Error("Test Idea was not created.");
  return idea;
}

async function createContext(payload: ContentDnaPayload = readyPayload) {
  const user = await createUser();
  const workspace = await createWorkspace(user.id);
  const dna = await createDnaVersion(workspace.id, user.id, payload);
  const idea = await createIdea(workspace.id, dna.versionId);

  return { user, workspace, dna, idea };
}

function request(
  context: Awaited<ReturnType<typeof createContext>>,
  overrides: Record<string, unknown> = {},
) {
  return {
    workspaceId: context.workspace.id,
    sourceIdeaId: context.idea.id,
    baseContentDnaVersionId: context.dna.versionId,
    requestedLanguage: "en",
    format: "SHORT_VIDEO",
    instructions: "Use a practical example.",
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

function createGeneration(
  context: Awaited<ReturnType<typeof createContext>>,
  provider: FakeGenerateContentScriptProvider,
  clock: () => Date,
) {
  return createContentGenerationApplicationService({
    database,
    getAuthenticatedUserId: async () => context.user.id,
    providerFactory: () => provider,
    clock,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
}

function createReads(
  context: Awaited<ReturnType<typeof createContext>>,
  clock: () => Date = () => new Date("2026-09-01T10:00:00.000Z"),
  userId = context.user.id,
) {
  return createContentReadApplicationService({
    database,
    getAuthenticatedUserId: async () => userId,
    clock,
    logger: { info: vi.fn(), warn: vi.fn() },
  });
}

function createDrafts(
  context: Awaited<ReturnType<typeof createContext>>,
  clock: () => Date,
  userId = context.user.id,
) {
  return createContentDraftApplicationService({
    database,
    getAuthenticatedUserId: async () => userId,
    clock,
    logger: { info: vi.fn(), warn: vi.fn() },
  });
}

type SeedAttemptOptions = Readonly<{
  status: "PENDING" | "RUNNING" | "FAILED";
  createdAt: Date;
  startedAt?: Date;
  failedAt?: Date;
  errorCategory?:
    | "TIMEOUT"
    | "RATE_LIMITED"
    | "PROVIDER_UNAVAILABLE"
    | "INVALID_OUTPUT"
    | "INTERRUPTED"
    | "UNKNOWN";
  requestedLanguage?: "en" | "fa";
  format?: "SHORT_VIDEO" | "LONG_VIDEO";
  instructions?: string | null;
}>;

async function seedAttempt(
  context: Awaited<ReturnType<typeof createContext>>,
  options: SeedAttemptOptions,
) {
  const attemptId = randomUUID();
  const runId = randomUUID();
  const startedAt = options.status === "RUNNING" ? (options.startedAt ?? options.createdAt) : null;
  const failedAt = options.status === "FAILED" ? (options.failedAt ?? options.createdAt) : null;
  const errorCategory = options.status === "FAILED" ? (options.errorCategory ?? "UNKNOWN") : null;

  await database.transaction(async (transaction) => {
    await transaction.insert(schema.aiRuns).values({
      id: runId,
      workspaceId: context.workspace.id,
      kind: "CONTENT_SCRIPT_GENERATION",
      provider: "avalai",
      model: "gpt-5.6-luna",
      promptVersion: "content-script-generation/v1",
      generationSettings: contentScriptGenerationSettings,
      status: options.status,
      errorCategory,
      createdAt: options.createdAt,
      startedAt,
      failedAt,
    });
    await transaction.insert(schema.contentGenerationAttempts).values({
      id: attemptId,
      workspaceId: context.workspace.id,
      sourceIdeaId: context.idea.id,
      contentDnaVersionId: context.dna.versionId,
      requestedLanguage: options.requestedLanguage ?? "en",
      format: options.format ?? "SHORT_VIDEO",
      instructions:
        options.instructions === undefined ? "Seeded canonical instruction." : options.instructions,
      idempotencyKey: randomUUID(),
      requestFingerprint: randomUUID().replaceAll("-", "").padEnd(64, "a").slice(0, 64),
      aiRunId: runId,
      status: options.status,
      errorCategory,
      createdAt: options.createdAt,
      startedAt,
      failedAt,
    });
    await transaction.insert(schema.workspaceContentGenerationQuotaReservations).values({
      workspaceId: context.workspace.id,
      attemptId,
      reservedAt: options.createdAt,
      invokedAt: options.status === "RUNNING" ? startedAt : null,
    });
  });

  return { attemptId, runId };
}

async function countRows(
  table:
    | typeof schema.contentGenerationAttempts
    | typeof schema.aiRuns
    | typeof schema.contents
    | typeof schema.contentDrafts
    | typeof schema.contentVersions
    | typeof schema.workspaceContentGenerationQuotaReservations,
) {
  const [result] = await database.select({ value: count() }).from(table);
  return Number(result?.value ?? 0);
}

async function getAttemptPair(attemptId: string) {
  const [pair] = await database
    .select({ attempt: schema.contentGenerationAttempts, run: schema.aiRuns })
    .from(schema.contentGenerationAttempts)
    .innerJoin(schema.aiRuns, eq(schema.contentGenerationAttempts.aiRunId, schema.aiRuns.id))
    .where(eq(schema.contentGenerationAttempts.id, attemptId));

  return pair;
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

describe("Content read and Draft application services", () => {
  it("saves an exact-revision Draft with canonical human text and advances once", async () => {
    const context = await createContext();
    const generated = await createGeneration(
      context,
      new FakeGenerateContentScriptProvider(),
      () => new Date("2026-09-01T10:00:00.000Z"),
    ).generateContentScript(request(context));

    if (!generated.contentId) throw new Error("Test Content was not created.");

    const service = createDrafts(context, () => new Date("2026-09-01T10:01:00.000Z"));
    const saved = await service.saveContentDraft({
      workspaceId: context.workspace.id,
      contentId: generated.contentId,
      baseRevision: 1,
      document: {
        schemaVersion: 1,
        script: { text: "  edited\r\ntext  " },
      },
    });

    expect(saved).toEqual({
      document: {
        schemaVersion: 1,
        script: { text: "  edited\ntext  " },
      },
      revision: 2,
      updatedAt: new Date("2026-09-01T10:01:00.000Z"),
    });
    await expect(
      createReads(context).getContentDetail({
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
      }),
    ).resolves.toMatchObject({ draft: saved });
  });

  it("advances a Draft from revision 1 to 2 to 3 on exact saves", async () => {
    const context = await createContext();
    const generated = await createGeneration(
      context,
      new FakeGenerateContentScriptProvider(),
      () => new Date("2026-09-01T10:00:00.000Z"),
    ).generateContentScript(request(context));

    if (!generated.contentId) throw new Error("Test Content was not created.");

    let updatedAt = new Date("2026-09-01T10:01:00.000Z");
    const service = createDrafts(context, () => updatedAt);
    const second = await service.saveContentDraft({
      workspaceId: context.workspace.id,
      contentId: generated.contentId,
      baseRevision: 1,
      document: { schemaVersion: 1, script: { text: "Revision two" } },
    });
    updatedAt = new Date("2026-09-01T10:02:00.000Z");
    const third = await service.saveContentDraft({
      workspaceId: context.workspace.id,
      contentId: generated.contentId,
      baseRevision: second.revision,
      document: { schemaVersion: 1, script: { text: "Revision three" } },
    });

    expect(second).toMatchObject({
      document: { schemaVersion: 1, script: { text: "Revision two" } },
      revision: 2,
      updatedAt: new Date("2026-09-01T10:01:00.000Z"),
    });
    expect(third).toMatchObject({
      document: { schemaVersion: 1, script: { text: "Revision three" } },
      revision: 3,
      updatedAt: new Date("2026-09-01T10:02:00.000Z"),
    });
    expect(third.updatedAt.getTime()).toBeGreaterThan(second.updatedAt.getTime());
  });

  it("preserves human whitespace and Unicode while accepting empty and boundary-sized text", async () => {
    const context = await createContext();
    const generated = await createGeneration(
      context,
      new FakeGenerateContentScriptProvider(),
      () => new Date("2026-09-01T10:00:00.000Z"),
    ).generateContentScript(request(context));

    if (!generated.contentId) throw new Error("Test Content was not created.");

    let revision = 1;
    let updatedAt = new Date("2026-09-01T10:01:00.000Z");
    const service = createDrafts(context, () => updatedAt);
    const saves = [
      { text: "", expected: "" },
      { text: "x", expected: "x" },
      {
        text: "  فارسی / English \u200f!  \r\n\rline\n\nlast\t  ",
        expected: "  فارسی / English \u200f!  \n\nline\n\nlast\t  ",
      },
      { text: "x".repeat(50_000), expected: "x".repeat(50_000) },
    ];

    for (const value of saves) {
      const saved = await service.saveContentDraft({
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
        baseRevision: revision,
        document: { schemaVersion: 1, script: { text: value.text } },
      });

      revision += 1;
      updatedAt = new Date(updatedAt.getTime() + 60_000);
      expect(saved).toEqual({
        document: { schemaVersion: 1, script: { text: value.expected } },
        revision,
        updatedAt: new Date(updatedAt.getTime() - 60_000),
      });
    }

    const beforeInvalidSave = await createReads(context).getContentDetail({
      workspaceId: context.workspace.id,
      contentId: generated.contentId,
    });

    await expect(
      service.saveContentDraft({
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
        baseRevision: revision,
        document: { schemaVersion: 1, script: { text: "x".repeat(50_001) } },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.saveContentDraft({
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
        baseRevision: revision,
        document: {
          schemaVersion: 1,
          script: { text: "not persisted" },
          unknown: true,
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.saveContentDraft({
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
        baseRevision: revision,
        document: {
          schemaVersion: 1,
          script: { text: "not persisted", unknown: true },
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(
      createReads(context).getContentDetail({
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
      }),
    ).resolves.toEqual(beforeInvalidSave);
  });

  it("requires baseRevision and rejects client-controlled Draft metadata", async () => {
    const context = await createContext();
    const generated = await createGeneration(
      context,
      new FakeGenerateContentScriptProvider(),
      () => new Date("2026-09-01T10:00:00.000Z"),
    ).generateContentScript(request(context));

    if (!generated.contentId) throw new Error("Test Content was not created.");

    const service = createDrafts(context, () => new Date("2026-09-01T10:01:00.000Z"));
    const document = { schemaVersion: 1, script: { text: "valid" } };
    const invalidInputs = [
      {
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
        document,
      },
      {
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
        baseRevision: 0,
        document,
      },
      {
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
        baseRevision: 1.5,
        document,
      },
      {
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
        baseRevision: 1,
        document,
        newRevision: 2,
      },
      {
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
        baseRevision: 1,
        document,
        updatedAt: new Date(),
      },
    ];

    for (const input of invalidInputs) {
      await expect(service.saveContentDraft(input)).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    }
  });

  it("returns CONFLICT for stale and repeated stale saves without losing the winner", async () => {
    const context = await createContext();
    const generated = await createGeneration(
      context,
      new FakeGenerateContentScriptProvider(),
      () => new Date("2026-09-01T10:00:00.000Z"),
    ).generateContentScript(request(context));

    if (!generated.contentId) throw new Error("Test Content was not created.");

    let updatedAt = new Date("2026-09-01T10:01:00.000Z");
    const service = createDrafts(context, () => updatedAt);
    const winner = await service.saveContentDraft({
      workspaceId: context.workspace.id,
      contentId: generated.contentId,
      baseRevision: 1,
      document: { schemaVersion: 1, script: { text: "winner" } },
    });
    updatedAt = new Date("2026-09-01T10:02:00.000Z");

    const staleInput = {
      workspaceId: context.workspace.id,
      contentId: generated.contentId,
      baseRevision: 1,
      document: { schemaVersion: 1, script: { text: "stale loser" } },
    };
    await expect(service.saveContentDraft(staleInput)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(service.saveContentDraft(staleInput)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    await expect(
      createReads(context).getContentDetail({
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
      }),
    ).resolves.toMatchObject({ draft: winner });
  });

  it("allows exactly one winner for two simultaneous revision-N saves", async () => {
    const context = await createContext();
    const generated = await createGeneration(
      context,
      new FakeGenerateContentScriptProvider(),
      () => new Date("2026-09-01T10:00:00.000Z"),
    ).generateContentScript(request(context));

    if (!generated.contentId) throw new Error("Test Content was not created.");

    const service = createDrafts(context, () => new Date("2026-09-01T10:01:00.000Z"));
    const results = await Promise.allSettled([
      service.saveContentDraft({
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
        baseRevision: 1,
        document: { schemaVersion: 1, script: { text: "first winner candidate" } },
      }),
      service.saveContentDraft({
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
        baseRevision: 1,
        document: { schemaVersion: 1, script: { text: "second winner candidate" } },
      }),
    ]);

    const winners = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<Awaited<ReturnType<typeof service.saveContentDraft>>> =>
        result.status === "fulfilled",
    );
    const losers = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(winners[0]?.value.revision).toBe(2);
    expect(losers[0]?.reason).toMatchObject({ code: "CONFLICT" });

    const detail = await createReads(context).getContentDetail({
      workspaceId: context.workspace.id,
      contentId: generated.contentId,
    });
    expect(detail.draft.revision).toBe(2);
    expect(["first winner candidate", "second winner candidate"]).toContain(
      detail.draft.document.script.text,
    );
  });

  it("allows an authorized owner to read and save but rejects an unrelated user", async () => {
    const context = await createContext();
    const generated = await createGeneration(
      context,
      new FakeGenerateContentScriptProvider(),
      () => new Date("2026-09-01T10:00:00.000Z"),
    ).generateContentScript(request(context));

    if (!generated.contentId) throw new Error("Test Content was not created.");

    const unrelatedUser = await createUser();
    const ownerRead = createReads(context);
    const ownerDraft = createDrafts(context, () => new Date("2026-09-01T10:01:00.000Z"));
    const unrelatedRead = createReads(context, undefined, unrelatedUser.id);
    const unrelatedDraft = createDrafts(
      context,
      () => new Date("2026-09-01T10:02:00.000Z"),
      unrelatedUser.id,
    );

    await expect(
      ownerRead.getContentDetail({
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
      }),
    ).resolves.toMatchObject({ id: generated.contentId });
    await expect(
      ownerDraft.saveContentDraft({
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
        baseRevision: 1,
        document: { schemaVersion: 1, script: { text: "owner edit" } },
      }),
    ).resolves.toMatchObject({ revision: 2 });

    await expect(
      unrelatedRead.getContentDetail({
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      unrelatedDraft.saveContentDraft({
        workspaceId: context.workspace.id,
        contentId: generated.contentId,
        baseRevision: 2,
        document: { schemaVersion: 1, script: { text: "must not persist" } },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps foreign Content and forged workspace/content combinations nondisclosing", async () => {
    const local = await createContext();
    const foreign = await createContext();
    const localContent = await createGeneration(
      local,
      new FakeGenerateContentScriptProvider(),
      () => new Date("2026-09-01T10:00:00.000Z"),
    ).generateContentScript(request(local));
    const foreignContent = await createGeneration(
      foreign,
      new FakeGenerateContentScriptProvider(),
      () => new Date("2026-09-01T10:00:00.000Z"),
    ).generateContentScript(request(foreign));

    if (!localContent.contentId || !foreignContent.contentId) {
      throw new Error("Test Content was not created.");
    }

    const localDraft = createDrafts(local, () => new Date("2026-09-01T10:01:00.000Z"));
    await expect(
      localDraft.saveContentDraft({
        workspaceId: local.workspace.id,
        contentId: foreignContent.contentId,
        baseRevision: 1,
        document: { schemaVersion: 1, script: { text: "foreign overwrite" } },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      localDraft.saveContentDraft({
        workspaceId: foreign.workspace.id,
        contentId: localContent.contentId,
        baseRevision: 1,
        document: { schemaVersion: 1, script: { text: "forged workspace" } },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      createReads(foreign).getContentDetail({
        workspaceId: foreign.workspace.id,
        contentId: localContent.contentId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createReads(local).getContentDetail({
        workspaceId: local.workspace.id,
        contentId: foreignContent.contentId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("mutates only the Draft and preserves immutable lineage and generated artifacts", async () => {
    const context = await createContext();
    const generated = await createGeneration(
      context,
      new FakeGenerateContentScriptProvider(),
      () => new Date("2026-09-01T10:00:00.000Z"),
    ).generateContentScript(request(context));

    if (!generated.contentId) throw new Error("Test Content was not created.");

    const [contentBefore] = await database
      .select()
      .from(schema.contents)
      .where(eq(schema.contents.id, generated.contentId));
    const [attemptBefore] = await database
      .select()
      .from(schema.contentGenerationAttempts)
      .where(eq(schema.contentGenerationAttempts.id, generated.attempt.id));
    const [runBefore] = await database
      .select()
      .from(schema.aiRuns)
      .where(eq(schema.aiRuns.id, generated.attempt.aiRunId));
    const [versionBefore] = await database
      .select()
      .from(schema.contentVersions)
      .where(
        and(
          eq(schema.contentVersions.contentId, generated.contentId),
          eq(schema.contentVersions.versionNumber, 1),
        ),
      );
    const [ideaBefore] = await database
      .select()
      .from(schema.ideas)
      .where(eq(schema.ideas.id, context.idea.id));
    const [dnaVersionBefore] = await database
      .select()
      .from(schema.contentDnaVersions)
      .where(eq(schema.contentDnaVersions.id, context.dna.versionId));
    const versionCountBefore = await countRows(schema.contentVersions);

    let updatedAt = new Date("2026-09-01T10:01:00.000Z");
    const service = createDrafts(context, () => updatedAt);
    await service.saveContentDraft({
      workspaceId: context.workspace.id,
      contentId: generated.contentId,
      baseRevision: 1,
      document: { schemaVersion: 1, script: { text: "Human edit one" } },
    });
    updatedAt = new Date("2026-09-01T10:02:00.000Z");
    await service.saveContentDraft({
      workspaceId: context.workspace.id,
      contentId: generated.contentId,
      baseRevision: 2,
      document: { schemaVersion: 1, script: { text: "Human edit two" } },
    });

    const [contentAfter] = await database
      .select()
      .from(schema.contents)
      .where(eq(schema.contents.id, generated.contentId));
    const [attemptAfter] = await database
      .select()
      .from(schema.contentGenerationAttempts)
      .where(eq(schema.contentGenerationAttempts.id, generated.attempt.id));
    const [runAfter] = await database
      .select()
      .from(schema.aiRuns)
      .where(eq(schema.aiRuns.id, generated.attempt.aiRunId));
    const [versionAfter] = await database
      .select()
      .from(schema.contentVersions)
      .where(
        and(
          eq(schema.contentVersions.contentId, generated.contentId),
          eq(schema.contentVersions.versionNumber, 1),
        ),
      );
    const [ideaAfter] = await database
      .select()
      .from(schema.ideas)
      .where(eq(schema.ideas.id, context.idea.id));
    const [dnaVersionAfter] = await database
      .select()
      .from(schema.contentDnaVersions)
      .where(eq(schema.contentDnaVersions.id, context.dna.versionId));
    const [draftAfter] = await database
      .select()
      .from(schema.contentDrafts)
      .where(eq(schema.contentDrafts.contentId, generated.contentId));

    expect(contentAfter).toEqual(contentBefore);
    expect(attemptAfter).toEqual(attemptBefore);
    expect(runAfter).toEqual(runBefore);
    expect(versionAfter).toEqual(versionBefore);
    expect(ideaAfter).toEqual(ideaBefore);
    expect(dnaVersionAfter).toEqual(dnaVersionBefore);
    expect(await countRows(schema.contentVersions)).toBe(versionCountBefore);
    expect(draftAfter).toMatchObject({
      contentId: generated.contentId,
      document: { schemaVersion: 1, script: { text: "Human edit two" } },
      revision: 3,
      updatedAt: updatedAt,
    });
  });

  it("uses Draft.updatedAt for Content-list ordering without touching Content", async () => {
    const context = await createContext();
    let generationTime = new Date("2026-09-01T10:00:00.000Z");
    const first = await createGeneration(
      context,
      new FakeGenerateContentScriptProvider(),
      () => generationTime,
    ).generateContentScript(request(context));
    generationTime = new Date("2026-09-01T10:01:00.000Z");
    const second = await createGeneration(
      context,
      new FakeGenerateContentScriptProvider(),
      () => generationTime,
    ).generateContentScript(request(context, { requestedLanguage: "fa", format: "LONG_VIDEO" }));

    if (!first.contentId || !second.contentId) throw new Error("Test Content was not created.");

    const [contentBefore] = await database
      .select()
      .from(schema.contents)
      .where(eq(schema.contents.id, first.contentId));
    const reads = createReads(context);
    await expect(reads.listContent({ workspaceId: context.workspace.id })).resolves.toMatchObject([
      { id: second.contentId },
      { id: first.contentId },
    ]);

    const saved = await createDrafts(
      context,
      () => new Date("2026-09-01T10:02:00.000Z"),
    ).saveContentDraft({
      workspaceId: context.workspace.id,
      contentId: first.contentId,
      baseRevision: 1,
      document: { schemaVersion: 1, script: { text: "Moved to the top" } },
    });

    const ordered = await reads.listContent({ workspaceId: context.workspace.id });
    expect(ordered.map((item) => item.id)).toEqual([first.contentId, second.contentId]);
    expect(ordered[0]?.lastEditedAt).toEqual(saved.updatedAt);

    const [contentAfter] = await database
      .select()
      .from(schema.contents)
      .where(eq(schema.contents.id, first.contentId));
    expect(contentAfter).toEqual(contentBefore);
  });

  it("lists only approved metadata in Draft.updatedAt descending order and isolates workspaces", async () => {
    const context = await createContext();
    const foreign = await createContext();
    let now = new Date("2026-09-01T10:00:00.000Z");
    const provider = new FakeGenerateContentScriptProvider();
    const generation = createGeneration(context, provider, () => new Date(now));

    const first = await generation.generateContentScript(request(context));
    now = new Date("2026-09-01T10:11:00.000Z");
    const second = await generation.generateContentScript(
      request(context, { requestedLanguage: "fa", format: "LONG_VIDEO" }),
    );
    now = new Date("2026-09-01T10:22:00.000Z");
    const failedGeneration = createGeneration(
      context,
      new FakeGenerateContentScriptProvider({ scenario: "provider-unavailable" }),
      () => new Date(now),
    );
    await expect(failedGeneration.generateContentScript(request(context))).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });

    if (!first.contentId || !second.contentId) throw new Error("Test Content was not created.");
    await database
      .update(schema.contentDrafts)
      .set({ updatedAt: new Date("2026-09-01T10:01:00.000Z") })
      .where(eq(schema.contentDrafts.contentId, first.contentId));
    await database
      .update(schema.contentDrafts)
      .set({ updatedAt: new Date("2026-09-01T10:00:00.000Z") })
      .where(eq(schema.contentDrafts.contentId, second.contentId));

    const list = await createReads(context).listContent({ workspaceId: context.workspace.id });

    expect(list.map((item) => item.id)).toEqual([first.contentId, second.contentId]);
    expect(Object.keys(list[0] ?? {})).toEqual([
      "id",
      "sourceIdeaTitle",
      "format",
      "contentLanguage",
      "lastEditedAt",
    ]);
    expect(list).toMatchObject([
      {
        id: first.contentId,
        sourceIdeaTitle: "A useful idea",
        format: "SHORT_VIDEO",
        contentLanguage: "en",
        lastEditedAt: new Date("2026-09-01T10:01:00.000Z"),
      },
      {
        id: second.contentId,
        sourceIdeaTitle: "A useful idea",
        format: "LONG_VIDEO",
        contentLanguage: "fa",
        lastEditedAt: new Date("2026-09-01T10:00:00.000Z"),
      },
    ]);
    expect(list.some((item) => item.id === foreign.idea.id)).toBe(false);
    expect(JSON.stringify(list)).not.toContain("outputSnapshot");
    expect(JSON.stringify(list)).not.toContain("gpt-5.6");
    expect(JSON.stringify(list)).not.toContain("instructions");
  });

  it("returns the exact safe Draft detail and derives a completed Attempt result", async () => {
    const context = await createContext();
    const provider = new FakeGenerateContentScriptProvider();
    const generation = createGeneration(
      context,
      provider,
      () => new Date("2026-09-01T10:00:00.000Z"),
    );
    const generated = await generation.generateContentScript(request(context));
    const reads = createReads(context);

    const detail = await reads.getContentDetail({
      workspaceId: context.workspace.id,
      contentId: generated.contentId,
    });
    expect(detail).toEqual({
      id: generated.contentId,
      sourceIdea: { id: context.idea.id, title: "A useful idea" },
      contentLanguage: "en",
      format: "SHORT_VIDEO",
      draft: {
        document: {
          schemaVersion: 1,
          script: { text: "Deterministic English short-video script." },
        },
        revision: 1,
        updatedAt: new Date("2026-09-01T10:00:00.000Z"),
      },
    });

    const result = await reads.getContentGenerationAttemptResult({
      workspaceId: context.workspace.id,
      attemptId: generated.attempt.id,
    });
    expect(result).toEqual(detail);
    expect(JSON.stringify(detail)).not.toContain("aiRunId");
    expect(JSON.stringify(detail)).not.toContain("contentDnaVersionId");
    expect(JSON.stringify(detail)).not.toContain("requestFingerprint");
    expect(JSON.stringify(detail)).not.toContain("instructions");
    expect(JSON.stringify(detail)).not.toContain("outputSnapshot");
    expect(JSON.stringify(detail)).not.toContain("provider");
  });

  it("returns every Attempt state newest-first with canonical inputs, derived result, and USED", async () => {
    const context = await createContext();
    const completed = await createGeneration(
      context,
      new FakeGenerateContentScriptProvider(),
      () => new Date("2026-09-01T09:00:00.000Z"),
    ).generateContentScript(request(context, { instructions: "Completed canonical instruction." }));
    const pending = await seedAttempt(context, {
      status: "PENDING",
      createdAt: new Date("2026-09-01T09:03:00.000Z"),
      instructions: "Pending canonical instruction.",
    });
    const running = await seedAttempt(context, {
      status: "RUNNING",
      createdAt: new Date("2026-09-01T09:03:01.000Z"),
      startedAt: new Date("2026-09-01T09:03:02.000Z"),
      instructions: "Running canonical instruction.",
    });
    const failed = await seedAttempt(context, {
      status: "FAILED",
      createdAt: new Date("2026-09-01T09:03:03.000Z"),
      failedAt: new Date("2026-09-01T09:03:04.000Z"),
      errorCategory: "INVALID_OUTPUT",
      instructions: "Failed canonical instruction.",
    });

    const reads = createReads(context, () => new Date("2026-09-01T09:03:30.000Z"));
    const history = await reads.getIdeaContentGenerationHistory({
      workspaceId: context.workspace.id,
      sourceIdeaId: context.idea.id,
    });

    expect(history.sourceIdea).toEqual({ id: context.idea.id, title: "A useful idea" });
    expect(history.isUsed).toBe(true);
    expect(history.attempts.map((attempt) => attempt.id)).toEqual([
      failed.attemptId,
      running.attemptId,
      pending.attemptId,
      completed.attempt.id,
    ]);
    expect(history.attempts).toMatchObject([
      {
        id: failed.attemptId,
        status: "FAILED",
        errorCategory: "INVALID_OUTPUT",
        instructions: "Failed canonical instruction.",
        resultingContentId: null,
      },
      {
        id: running.attemptId,
        status: "RUNNING",
        errorCategory: null,
        instructions: "Running canonical instruction.",
        resultingContentId: null,
      },
      {
        id: pending.attemptId,
        status: "PENDING",
        errorCategory: null,
        instructions: "Pending canonical instruction.",
        resultingContentId: null,
      },
      {
        id: completed.attempt.id,
        status: "COMPLETED",
        errorCategory: null,
        instructions: "Completed canonical instruction.",
        resultingContentId: completed.contentId,
      },
    ]);

    const failedDetail = await reads.getContentGenerationAttemptDetail({
      workspaceId: context.workspace.id,
      attemptId: failed.attemptId,
    });
    expect(failedDetail).toMatchObject({
      sourceIdea: { id: context.idea.id, title: "A useful idea" },
      attempt: { id: failed.attemptId, instructions: "Failed canonical instruction." },
    });
    expect(JSON.stringify(failedDetail)).not.toContain("gpt-5.6");
    expect(JSON.stringify(failedDetail)).not.toContain("outputSnapshot");
    expect(JSON.stringify(failedDetail)).not.toContain("requestFingerprint");
    expect(JSON.stringify(failedDetail)).not.toContain("contentDnaVersionId");
  });

  it("derives unused and used Ideas without persisting or changing decision state", async () => {
    const context = await createContext();
    const reads = createReads(context);

    await expect(
      reads.getIdeaContentGenerationHistory({
        workspaceId: context.workspace.id,
        sourceIdeaId: context.idea.id,
      }),
    ).resolves.toMatchObject({ isUsed: false, attempts: [] });
    await expect(
      reads.getIdeaContentUsage({
        workspaceId: context.workspace.id,
        sourceIdeaId: context.idea.id,
      }),
    ).resolves.toEqual({ ideaId: context.idea.id, isUsed: false });

    let now = new Date("2026-09-01T10:00:00.000Z");
    const generation = createGeneration(
      context,
      new FakeGenerateContentScriptProvider(),
      () => new Date(now),
    );
    const first = await generation.generateContentScript(request(context));
    now = new Date("2026-09-01T10:11:00.000Z");
    const second = await generation.generateContentScript(
      request(context, { requestedLanguage: "fa", format: "LONG_VIDEO" }),
    );
    const used = await reads.getIdeaContentGenerationHistory({
      workspaceId: context.workspace.id,
      sourceIdeaId: context.idea.id,
    });
    const usage = await reads.getIdeaContentUsage({
      workspaceId: context.workspace.id,
      sourceIdeaId: context.idea.id,
    });
    const [storedIdea] = await database
      .select({ status: schema.ideas.status })
      .from(schema.ideas)
      .where(eq(schema.ideas.id, context.idea.id));

    expect(first.contentId).not.toBe(second.contentId);
    expect(used.isUsed).toBe(true);
    expect(used.attempts.filter((attempt) => attempt.resultingContentId)).toHaveLength(2);
    expect(usage).toEqual({ ideaId: context.idea.id, isUsed: true });
    expect(storedIdea?.status).toBe("ACCEPTED");
  });

  it("retries only FAILED Attempts through current-DNA acceptance and ordinary execution", async () => {
    const context = await createContext();
    const failedGeneration = createGeneration(
      context,
      new FakeGenerateContentScriptProvider({ scenario: "provider-unavailable" }),
      () => new Date("2026-09-01T10:00:00.000Z"),
    );
    await expect(
      failedGeneration.generateContentScript(request(context, { format: "LONG_VIDEO" })),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    const [failedAttempt] = await database.select().from(schema.contentGenerationAttempts);
    if (!failedAttempt) throw new Error("Failed Attempt was not persisted.");
    const originalPair = await getAttemptPair(failedAttempt.id);
    if (!originalPair) throw new Error("Failed Attempt pair was not persisted.");

    const currentVersionId = await setCurrentDnaVersion(
      context.dna,
      context.user.id,
      { ...readyPayload, expertise: { primaryTopics: ["Current retry DNA"] } },
      2,
    );
    const retryProvider = new FakeGenerateContentScriptProvider({ recordRequests: true });
    const retryGeneration = createGeneration(
      context,
      retryProvider,
      () => new Date("2026-09-01T10:11:00.000Z"),
    );
    const retry = await retryGeneration.retryContentGenerationAttempt({
      workspaceId: context.workspace.id,
      attemptId: failedAttempt.id,
    });

    expect(retry.replayed).toBe(false);
    expect(retry.attempt.id).not.toBe(failedAttempt.id);
    expect(retry.attempt.requestFingerprint).not.toBe(failedAttempt.requestFingerprint);
    expect(retry.attempt.contentDnaVersionId).toBe(currentVersionId);
    expect(retry.attempt.requestedLanguage).toBe("en");
    expect(retry.attempt.format).toBe("LONG_VIDEO");
    expect(retry.contentId).toBeTruthy();
    expect(retryProvider.invocationCount).toBe(1);
    expect(retryProvider.lastRequest).toMatchObject({
      requestedLanguage: "en",
      format: "LONG_VIDEO",
      instructions: "Use a practical example.",
      contentDna: { expertise: { primaryTopics: ["Current retry DNA"] } },
    });
    expect(await getAttemptPair(failedAttempt.id)).toEqual(originalPair);
    const [retryAttempt] = await database
      .select()
      .from(schema.contentGenerationAttempts)
      .where(eq(schema.contentGenerationAttempts.id, retry.attempt.id));
    expect(retryAttempt?.idempotencyKey).not.toBe(failedAttempt.idempotencyKey);
    expect(await countRows(schema.contentGenerationAttempts)).toBe(2);
    expect(await countRows(schema.aiRuns)).toBe(3);
    expect(await countRows(schema.workspaceContentGenerationQuotaReservations)).toBe(2);
  });

  it.each([
    ["PENDING", "PENDING"],
    ["RUNNING", "RUNNING"],
  ] as const)("rejects retrying an active %s Attempt without new state", async (_label, status) => {
    const context = await createContext();
    const seeded = await seedAttempt(context, {
      status,
      createdAt: new Date("2026-09-01T10:00:00.000Z"),
      startedAt: status === "RUNNING" ? new Date("2026-09-01T10:00:01.000Z") : undefined,
    });
    const provider = new FakeGenerateContentScriptProvider();
    const generation = createGeneration(
      context,
      provider,
      () => new Date("2026-09-01T10:00:30.000Z"),
    );
    const before = {
      attempts: await countRows(schema.contentGenerationAttempts),
      runs: await countRows(schema.aiRuns),
      reservations: await countRows(schema.workspaceContentGenerationQuotaReservations),
    };

    await expect(
      generation.retryContentGenerationAttempt({
        workspaceId: context.workspace.id,
        attemptId: seeded.attemptId,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(provider.invocationCount).toBe(0);
    expect(await countRows(schema.contentGenerationAttempts)).toBe(before.attempts);
    expect(await countRows(schema.aiRuns)).toBe(before.runs);
    expect(await countRows(schema.workspaceContentGenerationQuotaReservations)).toBe(
      before.reservations,
    );
  });

  it("rejects retrying COMPLETED and preserves its result", async () => {
    const context = await createContext();
    const generated = await createGeneration(
      context,
      new FakeGenerateContentScriptProvider(),
      () => new Date("2026-09-01T10:00:00.000Z"),
    ).generateContentScript(request(context));
    const provider = new FakeGenerateContentScriptProvider();
    const generation = createGeneration(
      context,
      provider,
      () => new Date("2026-09-01T10:00:30.000Z"),
    );
    const before = await getAttemptPair(generated.attempt.id);

    await expect(
      generation.retryContentGenerationAttempt({
        workspaceId: context.workspace.id,
        attemptId: generated.attempt.id,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(provider.invocationCount).toBe(0);
    expect(await getAttemptPair(generated.attempt.id)).toEqual(before);
    expect(await countRows(schema.contents)).toBe(1);
  });

  it.each([
    ["Idea is no longer ACCEPTED", "idea"],
    ["current DNA is not AI_READY", "dna"],
    ["requested language is no longer supported", "language"],
  ] as const)(
    "denies retry preflight when %s with zero new operational state",
    async (_label, scenario) => {
      const context = await createContext();
      const requestOverrides = scenario === "language" ? { requestedLanguage: "fa" } : {};
      const failedGeneration = createGeneration(
        context,
        new FakeGenerateContentScriptProvider({ scenario: "provider-unavailable" }),
        () => new Date("2026-09-01T10:00:00.000Z"),
      );
      await expect(
        failedGeneration.generateContentScript(request(context, requestOverrides)),
      ).rejects.toMatchObject({
        code: "PROVIDER_ERROR",
      });
      const [failedAttempt] = await database.select().from(schema.contentGenerationAttempts);
      if (!failedAttempt) throw new Error("Failed Attempt was not persisted.");

      if (scenario === "idea") {
        await database
          .update(schema.ideas)
          .set({ status: "NEW" })
          .where(eq(schema.ideas.id, context.idea.id));
      }
      if (scenario === "dna") {
        await setCurrentDnaVersion(context.dna, context.user.id, incompletePayload, 2);
      }
      if (scenario === "language") {
        await setCurrentDnaVersion(context.dna, context.user.id, englishOnlyPayload, 2);
      }

      const retryProvider = new FakeGenerateContentScriptProvider();
      const retryGeneration = createGeneration(
        context,
        retryProvider,
        () => new Date("2026-09-01T10:11:00.000Z"),
      );
      const before = {
        attempts: await countRows(schema.contentGenerationAttempts),
        runs: await countRows(schema.aiRuns),
        reservations: await countRows(schema.workspaceContentGenerationQuotaReservations),
      };

      await expect(
        retryGeneration.retryContentGenerationAttempt({
          workspaceId: context.workspace.id,
          attemptId: failedAttempt.id,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(retryProvider.invocationCount).toBe(0);
      expect(await countRows(schema.contentGenerationAttempts)).toBe(before.attempts);
      expect(await countRows(schema.aiRuns)).toBe(before.runs);
      expect(await countRows(schema.workspaceContentGenerationQuotaReservations)).toBe(
        before.reservations,
      );
    },
  );

  it("reevaluates current Content quota before retry and reports a workspace rate limit", async () => {
    const context = await createContext();
    const failedGeneration = createGeneration(
      context,
      new FakeGenerateContentScriptProvider({ scenario: "provider-unavailable" }),
      () => new Date("2026-09-01T10:00:00.000Z"),
    );
    await expect(failedGeneration.generateContentScript(request(context))).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    const [failedAttempt] = await database.select().from(schema.contentGenerationAttempts);
    if (!failedAttempt) throw new Error("Failed Attempt was not persisted.");
    await seedAttempt(context, {
      status: "RUNNING",
      createdAt: new Date("2026-09-01T10:00:00.000Z"),
      startedAt: new Date("2026-09-01T10:00:01.000Z"),
    });

    const retryProvider = new FakeGenerateContentScriptProvider();
    const retryGeneration = createGeneration(
      context,
      retryProvider,
      () => new Date("2026-09-01T10:05:00.000Z"),
    );
    const before = await countRows(schema.contentGenerationAttempts);

    await expect(
      retryGeneration.retryContentGenerationAttempt({
        workspaceId: context.workspace.id,
        attemptId: failedAttempt.id,
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", rateLimitSource: "workspace" });
    expect(retryProvider.invocationCount).toBe(0);
    expect(await countRows(schema.contentGenerationAttempts)).toBe(before);
    expect(await countRows(schema.aiRuns)).toBe(3);
    expect(await countRows(schema.workspaceContentGenerationQuotaReservations)).toBe(2);
  });

  it("recovers stale PENDING and RUNNING reads without a provider call, preserves active work, and is race-safe", async () => {
    const context = await createContext();
    const provider = new FakeGenerateContentScriptProvider();
    const completed = await createGeneration(
      context,
      provider,
      () => new Date("2026-09-01T09:00:00.000Z"),
    ).generateContentScript(request(context));
    const stalePending = await seedAttempt(context, {
      status: "PENDING",
      createdAt: new Date("2026-09-01T10:00:00.000Z"),
    });
    const staleRunning = await seedAttempt(context, {
      status: "RUNNING",
      createdAt: new Date("2026-09-01T10:00:00.000Z"),
      startedAt: new Date("2026-09-01T10:00:00.000Z"),
    });
    const activePending = await seedAttempt(context, {
      status: "PENDING",
      createdAt: new Date("2026-09-01T10:01:00.000Z"),
    });
    const terminalFailed = await seedAttempt(context, {
      status: "FAILED",
      createdAt: new Date("2026-09-01T09:30:00.000Z"),
      failedAt: new Date("2026-09-01T09:30:01.000Z"),
      errorCategory: "TIMEOUT",
    });
    const clock = () => new Date("2026-09-01T10:01:45.000Z");
    const firstReads = createReads(context, clock);
    const secondReads = createReads(context, clock);
    const [first, second] = await Promise.all([
      firstReads.getIdeaContentGenerationHistory({
        workspaceId: context.workspace.id,
        sourceIdeaId: context.idea.id,
      }),
      secondReads.getIdeaContentGenerationHistory({
        workspaceId: context.workspace.id,
        sourceIdeaId: context.idea.id,
      }),
    ]);

    expect(first.attempts.map((attempt) => [attempt.id, attempt.status])).toEqual(
      second.attempts.map((attempt) => [attempt.id, attempt.status]),
    );
    expect(first.attempts.find((attempt) => attempt.id === stalePending.attemptId)).toMatchObject({
      status: "FAILED",
      errorCategory: "INTERRUPTED",
    });
    expect(first.attempts.find((attempt) => attempt.id === staleRunning.attemptId)).toMatchObject({
      status: "FAILED",
      errorCategory: "INTERRUPTED",
    });
    expect(first.attempts.find((attempt) => attempt.id === activePending.attemptId)?.status).toBe(
      "PENDING",
    );
    expect(first.attempts.find((attempt) => attempt.id === terminalFailed.attemptId)).toMatchObject(
      {
        status: "FAILED",
        errorCategory: "TIMEOUT",
      },
    );
    expect(first.attempts.find((attempt) => attempt.id === completed.attempt.id)?.status).toBe(
      "COMPLETED",
    );
    expect(provider.invocationCount).toBe(1);

    const [pendingReservation] = await database
      .select()
      .from(schema.workspaceContentGenerationQuotaReservations)
      .where(
        eq(schema.workspaceContentGenerationQuotaReservations.attemptId, stalePending.attemptId),
      );
    const [runningReservation] = await database
      .select()
      .from(schema.workspaceContentGenerationQuotaReservations)
      .where(
        eq(schema.workspaceContentGenerationQuotaReservations.attemptId, staleRunning.attemptId),
      );
    expect(pendingReservation?.releasedAt).not.toBeNull();
    expect(runningReservation?.invokedAt).not.toBeNull();
    expect(runningReservation?.releasedAt).toBeNull();
  });

  it("keeps foreign Content, Idea history, Attempt detail, result, and instructions nondisclosing", async () => {
    const owner = await createContext();
    const foreign = await createContext();
    const generated = await createGeneration(
      owner,
      new FakeGenerateContentScriptProvider(),
      () => new Date("2026-09-01T10:00:00.000Z"),
    ).generateContentScript(request(owner));
    const reads = createReads(foreign);

    await expect(
      reads.getContentDetail({
        workspaceId: foreign.workspace.id,
        contentId: generated.contentId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      reads.getIdeaContentGenerationHistory({
        workspaceId: foreign.workspace.id,
        sourceIdeaId: owner.idea.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      reads.getContentGenerationAttemptDetail({
        workspaceId: foreign.workspace.id,
        attemptId: generated.attempt.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      reads.getContentGenerationAttemptResult({
        workspaceId: foreign.workspace.id,
        attemptId: generated.attempt.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(JSON.stringify(foreign)).not.toContain("Use a practical example.");
  });
});
