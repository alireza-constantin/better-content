import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import { ApplicationError } from "@/lib/errors/app-error";
import {
  createGenerateContentScriptSuccess,
  type GenerateContentScriptRequest,
} from "@/modules/ai/domain/generate-content-script";
import { FakeGenerateContentScriptProvider } from "@/modules/ai/testing/fake-generate-content-script-provider";
import {
  fingerprintContentScriptGenerationRequest,
  parseCanonicalContentScriptGenerationRequest,
} from "@/modules/content/domain/content-script-contracts";
import {
  contentScriptGenerationSettings,
  completeContentGenerationInvocation,
  failContentGenerationInvocation,
  findContentByGenerationAttemptId,
  reserveContentGenerationOperation,
  startContentGenerationInvocation,
} from "./content-generation-repository";
import {
  parseContentDnaPayload,
  type ContentDnaPayload,
} from "@/modules/dna/domain/content-dna-payload";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/server", () => ({ getServerSession: vi.fn() }));

import { createContentGenerationApplicationService } from "./content-generation-service";

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
  await database
    .insert(schema.workspaceMembers)
    .values({ workspaceId: workspace.id, userId, role: "owner" });
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

async function addCurrentDnaVersion(
  dna: { contentDnaId: string; versionId: string },
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

  return { contentDnaId: dna.contentDnaId, versionId };
}

async function createIdea(
  workspaceId: string,
  contentDnaVersionId: string,
  status = "ACCEPTED" as const,
) {
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
      contentDnaVersionId,
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

async function createContextWithoutCurrentDna() {
  const user = await createUser();
  const workspace = await createWorkspace(user.id);
  const foreignUser = await createUser();
  const foreignWorkspace = await createWorkspace(foreignUser.id);
  const foreignDna = await createDnaVersion(foreignWorkspace.id, foreignUser.id, readyPayload);
  const idea = await createIdea(workspace.id, foreignDna.versionId);

  return { user, workspace, dna: foreignDna, idea };
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

async function countContentRuns() {
  const [result] = await database
    .select({ value: count() })
    .from(schema.aiRuns)
    .where(eq(schema.aiRuns.kind, "CONTENT_SCRIPT_GENERATION"));
  return Number(result?.value ?? 0);
}

async function seedInvokedContentReservation(
  context: Awaited<ReturnType<typeof createContext>>,
  invokedAt: Date,
) {
  const runId = randomUUID();
  const attemptId = randomUUID();

  await database.transaction(async (transaction) => {
    await transaction.insert(schema.aiRuns).values({
      id: runId,
      workspaceId: context.workspace.id,
      kind: "CONTENT_SCRIPT_GENERATION",
      provider: "avalai",
      model: "gpt-5.6-luna",
      promptVersion: "content-script-generation/v1",
      generationSettings: contentScriptGenerationSettings,
      status: "RUNNING",
      createdAt: invokedAt,
      startedAt: invokedAt,
    });
    await transaction.insert(schema.contentGenerationAttempts).values({
      id: attemptId,
      workspaceId: context.workspace.id,
      sourceIdeaId: context.idea.id,
      contentDnaVersionId: context.dna.versionId,
      requestedLanguage: "en",
      format: "SHORT_VIDEO",
      idempotencyKey: randomUUID(),
      requestFingerprint: randomUUID().replaceAll("-", "").padEnd(64, "a").slice(0, 64),
      aiRunId: runId,
      status: "RUNNING",
      createdAt: invokedAt,
      startedAt: invokedAt,
    });
    await transaction.insert(schema.workspaceContentGenerationQuotaReservations).values({
      workspaceId: context.workspace.id,
      attemptId,
      reservedAt: invokedAt,
      invokedAt,
    });
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

describe("content generation acceptance", () => {
  it("atomically accepts an eligible request without invoking a provider", async () => {
    const context = await createContext();
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
    });

    const result = await service.acceptContentGeneration(request(context));

    expect(result).toMatchObject({
      replayed: false,
      attempt: {
        sourceIdeaId: context.idea.id,
        contentDnaVersionId: context.dna.versionId,
        requestedLanguage: "en",
        format: "SHORT_VIDEO",
        instructions: "Use a practical example.",
        status: "PENDING",
        errorCategory: null,
      },
    });
    expect(await countRows(schema.contentGenerationAttempts)).toBe(1);
    expect(await countRows(schema.aiRuns)).toBe(2);
    expect(await countRows(schema.workspaceContentGenerationQuotaReservations)).toBe(1);

    const [attempt] = await database
      .select()
      .from(schema.contentGenerationAttempts)
      .where(eq(schema.contentGenerationAttempts.id, result.attempt.id));
    const [run] = await database
      .select()
      .from(schema.aiRuns)
      .where(eq(schema.aiRuns.id, result.attempt.aiRunId));
    const [reservation] = await database
      .select()
      .from(schema.workspaceContentGenerationQuotaReservations)
      .where(eq(schema.workspaceContentGenerationQuotaReservations.attemptId, result.attempt.id));

    expect(attempt).toMatchObject({
      workspaceId: context.workspace.id,
      aiRunId: result.attempt.aiRunId,
      requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(run).toMatchObject({
      workspaceId: context.workspace.id,
      kind: "CONTENT_SCRIPT_GENERATION",
      provider: "avalai",
      model: "gpt-5.6-luna",
      promptVersion: "content-script-generation/v1",
      status: "PENDING",
      outputSnapshot: null,
      usage: null,
      providerRequestCorrelation: null,
    });
    expect(reservation).toMatchObject({
      workspaceId: context.workspace.id,
      attemptId: result.attempt.id,
      invokedAt: null,
      releasedAt: null,
    });
  });

  it("rejects ineligible Ideas without operational side effects", async () => {
    const context = await createContext();
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
    });

    for (const status of ["NEW", "SAVED", "REJECTED"] as const) {
      await database
        .update(schema.ideas)
        .set({ status })
        .where(eq(schema.ideas.id, context.idea.id));
      await expect(service.acceptContentGeneration(request(context))).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    }

    expect(await countRows(schema.contentGenerationAttempts)).toBe(0);
    expect(await countRows(schema.workspaceContentGenerationQuotaReservations)).toBe(0);
  });

  it("replays before mutable validation and conflicts on a different canonical request", async () => {
    const context = await createContext();
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
    });
    const operation = request(context);
    const first = await service.acceptContentGeneration(operation);

    await database
      .update(schema.ideas)
      .set({ status: "REJECTED" })
      .where(eq(schema.ideas.id, context.idea.id));
    const replay = await service.acceptContentGeneration(operation);

    expect(replay).toMatchObject({
      replayed: true,
      attempt: { id: first.attempt.id, status: "PENDING" },
    });
    await expect(
      service.acceptContentGeneration({ ...operation, format: "LONG_VIDEO" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await countRows(schema.contentGenerationAttempts)).toBe(1);
    expect(await countRows(schema.workspaceContentGenerationQuotaReservations)).toBe(1);
  });

  it("rejects unauthenticated and non-owner callers before replay details or operational work", async () => {
    const context = await createContext();
    const otherUser = await createUser();
    const operation = request(context);

    const unauthenticated = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => null,
    });
    const nonOwner = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => otherUser.id,
    });

    await expect(unauthenticated.acceptContentGeneration(operation)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(nonOwner.acceptContentGeneration(operation)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await countRows(schema.contentGenerationAttempts)).toBe(0);
  });

  it("keeps foreign Idea and forged workspace identifiers nondisclosing", async () => {
    const local = await createContext();
    const foreign = await createContext();
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => local.user.id,
    });

    await expect(
      service.acceptContentGeneration(request(local, { sourceIdeaId: foreign.idea.id })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.acceptContentGeneration(
        request(local, { workspaceId: foreign.workspace.id, sourceIdeaId: local.idea.id }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await countRows(schema.contentGenerationAttempts)).toBe(0);
  });

  it.each(["no DNA", "incomplete DNA", "stale base", "unsupported language"] as const)(
    "rejects %s before creating an Attempt, AI Run, or reservation",
    async (caseName) => {
      const incompletePayload = parseContentDnaPayload({
        schemaVersion: 1,
        identity: { creatorOrBrandDescription: "Only an identity." },
      });
      const languagePayload = parseContentDnaPayload({
        ...readyPayload,
        language: { defaultContentLanguage: "en", contentLanguages: ["en"] },
      });
      const context =
        caseName === "no DNA"
          ? await createContextWithoutCurrentDna()
          : await createContext(
              caseName === "incomplete DNA"
                ? incompletePayload
                : caseName === "unsupported language"
                  ? languagePayload
                  : readyPayload,
            );
      const service = createContentGenerationApplicationService({
        database,
        getAuthenticatedUserId: async () => context.user.id,
      });
      let operation = request(context);

      if (caseName === "no DNA") {
        operation = request(context, { baseContentDnaVersionId: context.dna.versionId });
      } else if (caseName === "stale base") {
        const newer = await addCurrentDnaVersion(context.dna, context.user.id, readyPayload, 2);
        operation = request(context, { baseContentDnaVersionId: context.dna.versionId });
        expect(newer.versionId).not.toBe(context.dna.versionId);
      } else if (caseName === "unsupported language") {
        operation = request(context, {
          baseContentDnaVersionId: context.dna.versionId,
          requestedLanguage: "fa",
        });
      }

      await expect(service.acceptContentGeneration(operation)).rejects.toMatchObject({
        code: caseName === "stale base" ? "CONFLICT" : "VALIDATION_ERROR",
      });
      expect(await countRows(schema.contentGenerationAttempts)).toBe(0);
      expect(await countRows(schema.workspaceContentGenerationQuotaReservations)).toBe(0);
    },
  );

  it("binds the current DNA version instead of the Idea batch's historical version", async () => {
    const context = await createContext();
    const currentPayload = parseContentDnaPayload({
      ...readyPayload,
      identity: { creatorOrBrandDescription: "The current Content DNA." },
    });
    const current = await addCurrentDnaVersion(context.dna, context.user.id, currentPayload, 2);
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
    });

    const result = await service.acceptContentGeneration(
      request(context, { baseContentDnaVersionId: current.versionId }),
    );

    expect(result.attempt.contentDnaVersionId).toBe(current.versionId);
    expect(result.attempt.contentDnaVersionId).not.toBe(context.idea.batchId);
    const [batch] = await database
      .select()
      .from(schema.ideaGenerationBatches)
      .where(eq(schema.ideaGenerationBatches.id, context.idea.batchId));
    expect(result.attempt.contentDnaVersionId).not.toBe(batch?.contentDnaVersionId);
  });

  it("does not create Content when the Idea is accepted", async () => {
    const context = await createContext();
    await database
      .update(schema.ideas)
      .set({ status: "NEW" })
      .where(eq(schema.ideas.id, context.idea.id));
    const decisionService = (
      await import("@/modules/ideas/application/idea-decision-service")
    ).createIdeaDecisionApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
    });

    await decisionService.updateIdeaDecision({
      workspaceId: context.workspace.id,
      ideaId: context.idea.id,
      nextState: "ACCEPTED",
    });

    expect(await countRows(schema.contentGenerationAttempts)).toBe(0);
    expect(await countRows(schema.contents)).toBe(0);
  });

  it("enforces the two live reservations per ten-minute window", async () => {
    const context = await createContext();
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
    });

    await service.acceptContentGeneration(request(context));
    await service.acceptContentGeneration(request(context));
    await expect(service.acceptContentGeneration(request(context))).rejects.toMatchObject({
      code: "RATE_LIMITED",
      rateLimitSource: "workspace",
    });
    expect(await countRows(schema.contentGenerationAttempts)).toBe(2);
    expect(await countRows(schema.workspaceContentGenerationQuotaReservations)).toBe(2);
  });

  it("enforces the eight invoked-attempts per twenty-four-hour window", async () => {
    const context = await createContext();
    const now = new Date("2026-09-01T10:00:00.000Z");
    for (let index = 1; index <= 8; index += 1) {
      await seedInvokedContentReservation(
        context,
        new Date(now.getTime() - index * 11 * 60 * 1_000),
      );
    }
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      clock: () => now,
    });

    await expect(service.acceptContentGeneration(request(context))).rejects.toMatchObject({
      code: "RATE_LIMITED",
      rateLimitSource: "workspace",
    });
    expect(await countRows(schema.contentGenerationAttempts)).toBe(8);
    expect(await countRows(schema.workspaceContentGenerationQuotaReservations)).toBe(8);
  });

  it("keeps Content quota independent from Idea quota and other workspaces", async () => {
    const first = await createContext();
    const second = await createContext();
    const firstService = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => first.user.id,
    });
    const secondService = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => second.user.id,
    });

    await database.insert(schema.workspaceGenerationQuotaReservations).values({
      workspaceId: first.workspace.id,
      batchId: first.idea.batchId,
      reservedAt: new Date(),
    });
    await firstService.acceptContentGeneration(request(first));
    await firstService.acceptContentGeneration(request(first));
    await secondService.acceptContentGeneration(request(second));

    expect(await countRows(schema.contentGenerationAttempts)).toBe(3);
  });

  it("recovers stale PENDING pairs atomically and releases only their uninvoked reservation", async () => {
    const initial = new Date("2026-09-01T10:00:00.000Z");
    let now = initial;
    const context = await createContext();
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      clock: () => new Date(now),
    });
    const stale = await service.acceptContentGeneration(request(context));

    now = new Date(initial.getTime() + 105_001);
    const fresh = await service.acceptContentGeneration(request(context));
    const [attempt] = await database
      .select()
      .from(schema.contentGenerationAttempts)
      .where(eq(schema.contentGenerationAttempts.id, stale.attempt.id));
    const [run] = await database
      .select()
      .from(schema.aiRuns)
      .where(eq(schema.aiRuns.id, stale.attempt.aiRunId));
    const [reservation] = await database
      .select()
      .from(schema.workspaceContentGenerationQuotaReservations)
      .where(eq(schema.workspaceContentGenerationQuotaReservations.attemptId, stale.attempt.id));

    expect(fresh.replayed).toBe(false);
    expect(attempt).toMatchObject({ status: "FAILED", errorCategory: "INTERRUPTED" });
    expect(run).toMatchObject({ status: "FAILED", errorCategory: "INTERRUPTED" });
    expect(reservation).toMatchObject({ invokedAt: null, releasedAt: now });
    expect(await countRows(schema.contents)).toBe(0);
  });

  it("leaves non-stale PENDING pairs untouched during explicit recovery", async () => {
    const now = new Date("2026-09-01T10:00:00.000Z");
    const context = await createContext();
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      clock: () => new Date(now),
    });
    const accepted = await service.acceptContentGeneration(request(context));

    await expect(
      service.recoverStalePendingAttempts({ workspaceId: context.workspace.id }),
    ).resolves.toEqual({ recovered: 0 });
    const [attempt] = await database
      .select()
      .from(schema.contentGenerationAttempts)
      .where(eq(schema.contentGenerationAttempts.id, accepted.attempt.id));
    expect(attempt?.status).toBe("PENDING");
  });

  it("makes concurrent stale PENDING recovery safe and idempotent", async () => {
    const initial = new Date("2026-09-01T10:00:00.000Z");
    let now = initial;
    const context = await createContext();
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      clock: () => new Date(now),
    });
    const accepted = await service.acceptContentGeneration(request(context));
    now = new Date(initial.getTime() + 105_001);

    const results = await Promise.all([
      service.recoverStalePendingAttempts({ workspaceId: context.workspace.id }),
      service.recoverStalePendingAttempts({ workspaceId: context.workspace.id }),
    ]);

    expect(results.map((result) => result.recovered).sort()).toEqual([0, 1]);
    const [attempt] = await database
      .select()
      .from(schema.contentGenerationAttempts)
      .where(eq(schema.contentGenerationAttempts.id, accepted.attempt.id));
    expect(attempt).toMatchObject({ status: "FAILED", errorCategory: "INTERRUPTED" });
  });

  it("rolls back the Attempt, AI Run, and reservation together when the acceptance transaction aborts", async () => {
    const context = await createContext();
    const operation = parseCanonicalContentScriptGenerationRequest(request(context));
    const fingerprint = fingerprintContentScriptGenerationRequest(operation);

    await expect(
      database.transaction(async (transaction) => {
        const result = await reserveContentGenerationOperation(
          transaction,
          context.user.id,
          operation,
          fingerprint,
          () => new Date("2026-09-01T10:00:00.000Z"),
        );
        expect(result.kind).toBe("created");
        throw new Error("simulated acceptance persistence failure");
      }),
    ).rejects.toThrow("simulated acceptance persistence failure");

    expect(await countRows(schema.contentGenerationAttempts)).toBe(0);
    expect(await countContentRuns()).toBe(0);
    expect(await countRows(schema.workspaceContentGenerationQuotaReservations)).toBe(0);
  });

  it("converges concurrent same-key requests and concurrent quota decisions", async () => {
    const context = await createContext();
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
    });
    const sameKey = request(context);
    const sameKeyResults = await Promise.all([
      service.acceptContentGeneration(sameKey),
      service.acceptContentGeneration(sameKey),
    ]);

    expect(new Set(sameKeyResults.map((result) => result.attempt.id))).toHaveLength(1);
    expect(sameKeyResults.filter((result) => result.replayed)).toHaveLength(1);

    const quotaResults = await Promise.allSettled([
      service.acceptContentGeneration(request(context)),
      service.acceptContentGeneration(request(context)),
      service.acceptContentGeneration(request(context)),
    ]);
    expect(quotaResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(quotaResults.filter((result) => result.status === "rejected")).toHaveLength(2);
    expect(
      quotaResults
        .filter((result) => result.status === "rejected")
        .every(
          (result) =>
            result.reason instanceof ApplicationError && result.reason.code === "RATE_LIMITED",
        ),
    ).toBe(true);
    expect(await countRows(schema.contentGenerationAttempts)).toBe(2);
    expect(await countRows(schema.workspaceContentGenerationQuotaReservations)).toBe(2);
  });
});

describe("content generation execution", () => {
  it("starts after durable RUNNING state and atomically creates the initial Content artifacts", async () => {
    const context = await createContext();
    await database
      .update(schema.ideas)
      .set({ productionQueuePosition: 1 })
      .where(eq(schema.ideas.id, context.idea.id));
    const fake = new FakeGenerateContentScriptProvider({
      recordRequests: true,
      usage: { inputTokens: 12, outputTokens: 34, totalTokens: 46 },
      providerRequestCorrelation: "avalai-content-request-1",
    });
    let statusAtProviderCall: string | undefined;
    const provider = {
      generateContentScript: vi.fn(async (providerRequest: GenerateContentScriptRequest) => {
        const [attempt] = await database
          .select()
          .from(schema.contentGenerationAttempts)
          .where(eq(schema.contentGenerationAttempts.sourceIdeaId, context.idea.id));
        statusAtProviderCall = attempt?.status;
        return fake.generateContentScript(providerRequest);
      }),
    };
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => provider,
    });

    const result = await service.generateContentScript(request(context));
    const [content] = await database
      .select()
      .from(schema.contents)
      .where(eq(schema.contents.id, result.contentId ?? ""));
    const [draft] = content
      ? await database
          .select()
          .from(schema.contentDrafts)
          .where(eq(schema.contentDrafts.contentId, content.id))
      : [];
    const [version] = content
      ? await database
          .select()
          .from(schema.contentVersions)
          .where(eq(schema.contentVersions.contentId, content.id))
      : [];
    const [attempt] = await database
      .select()
      .from(schema.contentGenerationAttempts)
      .where(eq(schema.contentGenerationAttempts.id, result.attempt.id));
    const [run] = await database
      .select()
      .from(schema.aiRuns)
      .where(eq(schema.aiRuns.id, result.attempt.aiRunId));
    const [reservation] = await database
      .select()
      .from(schema.workspaceContentGenerationQuotaReservations)
      .where(eq(schema.workspaceContentGenerationQuotaReservations.attemptId, result.attempt.id));

    expect(provider.generateContentScript).toHaveBeenCalledTimes(1);
    expect(fake.invocationCount).toBe(1);
    expect(statusAtProviderCall).toBe("RUNNING");
    expect(result).toMatchObject({
      replayed: false,
      attempt: { status: "COMPLETED", errorCategory: null },
    });
    expect(result.contentId).toEqual(expect.any(String));
    expect(content).toMatchObject({
      id: result.contentId,
      workspaceId: context.workspace.id,
      sourceIdeaId: context.idea.id,
      contentLanguage: "en",
      format: "SHORT_VIDEO",
      sourceGenerationAttemptId: result.attempt.id,
    });
    expect(draft).toMatchObject({ contentId: result.contentId, revision: 1 });
    expect(version).toMatchObject({
      contentId: result.contentId,
      versionNumber: 1,
      source: "AI_GENERATED",
      aiRunId: result.attempt.aiRunId,
      createdByUserId: context.user.id,
    });
    expect(run).toMatchObject({
      status: "COMPLETED",
      outputSnapshot: draft?.document,
      usage: { inputTokens: 12, outputTokens: 34, totalTokens: 46 },
      providerRequestCorrelation: "avalai-content-request-1",
    });
    expect(version?.document).toEqual(draft?.document);
    expect(run?.outputSnapshot).toEqual(version?.document);
    expect(attempt?.status).toBe("COMPLETED");
    const [sourceIdea] = await database
      .select({ productionQueuePosition: schema.ideas.productionQueuePosition })
      .from(schema.ideas)
      .where(eq(schema.ideas.id, context.idea.id));
    expect(sourceIdea?.productionQueuePosition).toBeNull();
    expect(reservation?.invokedAt).not.toBeNull();
    expect(reservation?.releasedAt).toBeNull();
    expect(
      await findContentByGenerationAttemptId(database, context.workspace.id, result.attempt.id),
    ).toMatchObject({ id: result.contentId });
    expect(fake.lastRequest).toMatchObject({
      generationKind: "CONTENT_SCRIPT_GENERATION",
      sourceIdea: { title: "A useful idea", description: "A useful description" },
      contentDna: readyPayload,
      requestedLanguage: "en",
      format: "SHORT_VIDEO",
      instructions: "Use a practical example.",
    });
  });

  it.each([
    ["refusal", "INVALID_OUTPUT", "AI_OUTPUT_INVALID"],
    ["incomplete", "INVALID_OUTPUT", "AI_OUTPUT_INVALID"],
    ["malformed", "INVALID_OUTPUT", "AI_OUTPUT_INVALID"],
    ["timeout", "TIMEOUT", "PROVIDER_ERROR"],
    ["rate-limited", "RATE_LIMITED", "RATE_LIMITED"],
    ["provider-unavailable", "PROVIDER_UNAVAILABLE", "PROVIDER_ERROR"],
    ["interrupted", "INTERRUPTED", "PROVIDER_ERROR"],
    ["unknown", "UNKNOWN", "PROVIDER_ERROR"],
  ] as const)(
    "durably records provider-neutral %s without creating artifacts",
    async (scenario, category, applicationCode) => {
      const context = await createContext();
      await database
        .update(schema.ideas)
        .set({ productionQueuePosition: 1 })
        .where(eq(schema.ideas.id, context.idea.id));
      const fake = new FakeGenerateContentScriptProvider({ scenario });
      const service = createContentGenerationApplicationService({
        database,
        getAuthenticatedUserId: async () => context.user.id,
        providerFactory: () => fake,
      });

      await expect(service.generateContentScript(request(context))).rejects.toMatchObject({
        code: applicationCode,
        ...(category === "RATE_LIMITED" ? { rateLimitSource: "provider" } : {}),
      });

      const [attempt] = await database
        .select()
        .from(schema.contentGenerationAttempts)
        .where(eq(schema.contentGenerationAttempts.sourceIdeaId, context.idea.id));
      const [run] = attempt
        ? await database.select().from(schema.aiRuns).where(eq(schema.aiRuns.id, attempt.aiRunId))
        : [];
      const [reservation] = attempt
        ? await database
            .select()
            .from(schema.workspaceContentGenerationQuotaReservations)
            .where(eq(schema.workspaceContentGenerationQuotaReservations.attemptId, attempt.id))
        : [];

      expect(fake.invocationCount).toBe(1);
      expect(attempt).toMatchObject({ status: "FAILED", errorCategory: category });
      expect(run).toMatchObject({
        status: "FAILED",
        errorCategory: category,
        outputSnapshot: null,
      });
      expect(reservation?.invokedAt).not.toBeNull();
      expect(reservation?.releasedAt).toBeNull();
      expect(await countRows(schema.contents)).toBe(0);
      expect(await countRows(schema.contentDrafts)).toBe(0);
      expect(await countRows(schema.contentVersions)).toBe(0);
      const [sourceIdea] = await database
        .select({ productionQueuePosition: schema.ideas.productionQueuePosition })
        .from(schema.ideas)
        .where(eq(schema.ideas.id, context.idea.id));
      expect(sourceIdea?.productionQueuePosition).toBe(1);
    },
  );

  it("maps a defensively invalid oversized result to INVALID_OUTPUT without truncation", async () => {
    const context = await createContext();
    const fake = new FakeGenerateContentScriptProvider({
      output: { schemaVersion: 1, script: { text: "x".repeat(50_001) } },
    });
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => fake,
    });

    await expect(service.generateContentScript(request(context))).rejects.toMatchObject({
      code: "AI_OUTPUT_INVALID",
    });
    const [attempt] = await database
      .select()
      .from(schema.contentGenerationAttempts)
      .where(eq(schema.contentGenerationAttempts.sourceIdeaId, context.idea.id));
    const [run] = await database
      .select()
      .from(schema.aiRuns)
      .where(eq(schema.aiRuns.id, attempt?.aiRunId ?? ""));

    expect(attempt).toMatchObject({ status: "FAILED", errorCategory: "INVALID_OUTPUT" });
    expect(run).toMatchObject({ status: "FAILED", outputSnapshot: null });
    expect(await countRows(schema.contents)).toBe(0);
    expect(await countRows(schema.contentDrafts)).toBe(0);
    expect(await countRows(schema.contentVersions)).toBe(0);
  });

  it("uses accepted Idea and DNA facts even when their mutable sources change during execution", async () => {
    const initial = new Date("2026-09-01T10:00:00.000Z");
    let now = initial;
    const context = await createContext();
    const fake = new FakeGenerateContentScriptProvider({ recordRequests: true });
    let announceProviderStart!: () => void;
    let releaseProvider!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      announceProviderStart = resolve;
    });
    const providerReleased = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const provider = {
      generateContentScript: vi.fn(async (providerRequest: GenerateContentScriptRequest) => {
        announceProviderStart();
        await providerReleased;
        return fake.generateContentScript(providerRequest);
      }),
    };
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => provider,
      clock: () => now,
    });
    const generation = service.generateContentScript(request(context));

    await providerStarted;
    for (const status of ["SAVED", "NEW", "REJECTED"] as const) {
      await database
        .update(schema.ideas)
        .set({ status })
        .where(eq(schema.ideas.id, context.idea.id));
    }
    const changedDna = await addCurrentDnaVersion(
      context.dna,
      context.user.id,
      parseContentDnaPayload({
        ...readyPayload,
        identity: { creatorOrBrandDescription: "A later DNA version." },
      }),
      2,
    );
    now = new Date(initial.getTime() + 1_000);
    releaseProvider();
    const result = await generation;

    expect(changedDna.versionId).not.toBe(result.attempt.contentDnaVersionId);
    expect(fake.lastRequest).toMatchObject({
      sourceIdea: { title: "A useful idea", description: "A useful description" },
      contentDna: readyPayload,
    });
    expect(result.attempt.status).toBe("COMPLETED");
  });

  it("allows concurrent execution callers to produce at most one provider call and one Content", async () => {
    const context = await createContext();
    const fake = new FakeGenerateContentScriptProvider();
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => fake,
    });
    const operation = request(context);
    const results = await Promise.allSettled([
      service.generateContentScript(operation),
      service.generateContentScript(operation),
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(fake.invocationCount).toBe(1);
    expect(await countRows(schema.contents)).toBe(1);
    expect(await countRows(schema.contentDrafts)).toBe(1);
    expect(await countRows(schema.contentVersions)).toBe(1);
    const [attempt] = await database
      .select()
      .from(schema.contentGenerationAttempts)
      .where(eq(schema.contentGenerationAttempts.sourceIdeaId, context.idea.id));
    expect(attempt?.status).toBe("COMPLETED");
  });

  it("recovers stale RUNNING work without a provider call and retains invoked quota", async () => {
    const initial = new Date("2026-09-01T10:00:00.000Z");
    let now = initial;
    const context = await createContext();
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      clock: () => now,
    });
    const accepted = await service.acceptContentGeneration(request(context));
    const started = await startContentGenerationInvocation(
      database,
      context.workspace.id,
      accepted.attempt.id,
      accepted.attempt.aiRunId,
      () => initial,
    );
    const fake = new FakeGenerateContentScriptProvider();

    expect(started.started).toBe(true);
    now = new Date(initial.getTime() + 105_001);
    const recovery = await service.recoverStaleRunningAttempts({
      workspaceId: context.workspace.id,
    });
    const lateFailure = await failContentGenerationInvocation(
      database,
      context.workspace.id,
      accepted.attempt.id,
      accepted.attempt.aiRunId,
      "UNKNOWN",
      () => new Date(initial.getTime() + 106_000),
    );
    const [reservation] = await database
      .select()
      .from(schema.workspaceContentGenerationQuotaReservations)
      .where(eq(schema.workspaceContentGenerationQuotaReservations.attemptId, accepted.attempt.id));

    expect(recovery).toEqual({ recovered: 1 });
    expect(fake.invocationCount).toBe(0);
    expect(lateFailure.attempt).toMatchObject({ status: "FAILED", errorCategory: "INTERRUPTED" });
    expect(lateFailure.run).toMatchObject({ status: "FAILED", errorCategory: "INTERRUPTED" });
    expect(reservation?.invokedAt).toEqual(initial);
    expect(reservation?.releasedAt).toBeNull();
    expect(await countRows(schema.contents)).toBe(0);
  });

  it("lets stale RUNNING recovery win against a late provider success", async () => {
    const initial = new Date("2026-09-01T10:00:00.000Z");
    let now = initial;
    const context = await createContext();
    const fake = new FakeGenerateContentScriptProvider();
    let announceProviderStart!: () => void;
    let releaseProvider!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      announceProviderStart = resolve;
    });
    const providerReleased = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const provider = {
      generateContentScript: async (providerRequest: GenerateContentScriptRequest) => {
        announceProviderStart();
        await providerReleased;
        return fake.generateContentScript(providerRequest);
      },
    };
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => provider,
      clock: () => now,
    });
    const generation = service.generateContentScript(request(context));

    await providerStarted;
    now = new Date(initial.getTime() + 105_001);
    await expect(
      service.recoverStaleRunningAttempts({ workspaceId: context.workspace.id }),
    ).resolves.toEqual({ recovered: 1 });
    releaseProvider();
    await expect(generation).rejects.toMatchObject({ code: "PROVIDER_ERROR" });

    const [attempt] = await database
      .select()
      .from(schema.contentGenerationAttempts)
      .where(eq(schema.contentGenerationAttempts.sourceIdeaId, context.idea.id));
    expect(fake.invocationCount).toBe(1);
    expect(attempt).toMatchObject({ status: "FAILED", errorCategory: "INTERRUPTED" });
    expect(await countRows(schema.contents)).toBe(0);
    expect(await countRows(schema.contentDrafts)).toBe(0);
    expect(await countRows(schema.contentVersions)).toBe(0);
  });

  it("rolls back all success artifacts when final persistence fails, then recovers the remaining RUNNING pair", async () => {
    const initial = new Date("2026-09-01T10:00:00.000Z");
    let now = initial;
    const context = await createContext();
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      clock: () => now,
    });
    const accepted = await service.acceptContentGeneration(request(context));
    const started = await startContentGenerationInvocation(
      database,
      context.workspace.id,
      accepted.attempt.id,
      accepted.attempt.aiRunId,
      () => initial,
    );
    const generated = createGenerateContentScriptSuccess({
      schemaVersion: 1,
      script: { text: "A canonical script." },
    });

    if (!generated.ok) {
      throw new Error("The test result should be successful.");
    }

    await expect(
      completeContentGenerationInvocation(
        database,
        context.workspace.id,
        accepted.attempt.id,
        accepted.attempt.aiRunId,
        "missing-user-for-final-persistence",
        generated,
        () => initial,
      ),
    ).rejects.toBeDefined();

    const [attemptAfterFailure] = await database
      .select()
      .from(schema.contentGenerationAttempts)
      .where(eq(schema.contentGenerationAttempts.id, accepted.attempt.id));
    const [runAfterFailure] = await database
      .select()
      .from(schema.aiRuns)
      .where(eq(schema.aiRuns.id, accepted.attempt.aiRunId));

    expect(started.started).toBe(true);
    expect(attemptAfterFailure?.status).toBe("RUNNING");
    expect(runAfterFailure?.status).toBe("RUNNING");
    expect(await countRows(schema.contents)).toBe(0);
    expect(await countRows(schema.contentDrafts)).toBe(0);
    expect(await countRows(schema.contentVersions)).toBe(0);

    now = new Date(initial.getTime() + 105_001);
    await expect(
      service.recoverStaleRunningAttempts({ workspaceId: context.workspace.id }),
    ).resolves.toEqual({ recovered: 1 });
    expect(
      await findContentByGenerationAttemptId(database, context.workspace.id, accepted.attempt.id),
    ).toBeUndefined();
  });

  it("discards duplicate completion and late failure after a terminal success", async () => {
    const context = await createContext();
    const fake = new FakeGenerateContentScriptProvider();
    const service = createContentGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => fake,
    });
    const result = await service.generateContentScript(request(context));
    const duplicate = await completeContentGenerationInvocation(
      database,
      context.workspace.id,
      result.attempt.id,
      result.attempt.aiRunId,
      context.user.id,
      {
        ok: true,
        output: {
          schemaVersion: 1,
          script: { text: "A late different script." },
        },
      },
      () => new Date(),
    );
    const lateFailure = await failContentGenerationInvocation(
      database,
      context.workspace.id,
      result.attempt.id,
      result.attempt.aiRunId,
      "UNKNOWN",
      () => new Date(),
    );

    expect(duplicate).toMatchObject({ completed: false, contentId: result.contentId });
    expect(lateFailure.attempt.status).toBe("COMPLETED");
    expect(lateFailure.run.status).toBe("COMPLETED");
    expect(await countRows(schema.contents)).toBe(1);
    expect(await countRows(schema.contentDrafts)).toBe(1);
    expect(await countRows(schema.contentVersions)).toBe(1);
  });
});
