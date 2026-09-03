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
  fingerprintContentScriptGenerationRequest,
  parseCanonicalContentScriptGenerationRequest,
} from "@/modules/content/domain/content-script-contracts";
import {
  contentScriptGenerationSettings,
  reserveContentGenerationOperation,
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
