import { randomUUID } from "node:crypto";

import { count, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import { FakeGenerateIdeasProvider } from "@/modules/ai/testing/fake-generate-ideas-provider";
import {
  parseContentDnaPayload,
  type ContentDnaPayload,
} from "@/modules/dna/domain/content-dna-payload";
import { ApplicationError } from "@/lib/errors/app-error";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/server", () => ({ getServerSession: vi.fn() }));

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

const incompletePayload: ContentDnaPayload = parseContentDnaPayload({
  schemaVersion: 1,
  identity: { creatorOrBrandDescription: "An educator." },
});

function createClock(initial: Date): { now: () => Date; set: (value: Date) => void } {
  let current = initial;

  return {
    now: () => new Date(current),
    set: (value) => {
      current = value;
    },
  };
}

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function createUser(email = `${randomUUID()}@example.com`) {
  const [user] = await database
    .insert(schema.user)
    .values({ id: randomUUID(), name: "Creator", email })
    .returning();

  if (!user) {
    throw new Error("Test user creation did not return a user.");
  }

  return user;
}

async function createWorkspaceForUser(userId: string) {
  const [workspace] = await database
    .insert(schema.workspaces)
    .values({ name: "Workspace" })
    .returning();

  if (!workspace) {
    throw new Error("Test workspace creation did not return a workspace.");
  }

  await database.insert(schema.workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: "owner",
  });

  return workspace;
}

async function createDnaVersion(
  workspaceId: string,
  userId: string,
  payload: ContentDnaPayload,
): Promise<{ containerId: string; versionId: string }> {
  const containerId = randomUUID();
  const versionId = randomUUID();

  await database.transaction(async (transaction) => {
    await transaction.insert(schema.contentDna).values({
      id: containerId,
      workspaceId,
      currentVersionId: versionId,
    });
    await transaction.insert(schema.contentDnaVersions).values({
      id: versionId,
      contentDnaId: containerId,
      versionNumber: 1,
      payload,
      createdByUserId: userId,
    });
  });

  return { containerId, versionId };
}

async function createContext(payload: ContentDnaPayload = readyPayload) {
  const user = await createUser();
  const workspace = await createWorkspaceForUser(user.id);
  const dna = await createDnaVersion(workspace.id, user.id, payload);

  return { user, workspace, dna };
}

function input(
  context: Awaited<ReturnType<typeof createContext>>,
  overrides: Record<string, unknown> = {},
) {
  return {
    workspaceId: context.workspace.id,
    baseContentDnaVersionId: context.dna.versionId,
    requestedLanguage: "en",
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

async function countRows(
  table:
    | typeof schema.aiRuns
    | typeof schema.ideaGenerationBatches
    | typeof schema.ideas
    | typeof schema.workspaceGenerationQuotaReservations,
) {
  const [result] = await database.select({ value: count() }).from(table);

  return Number(result?.value ?? 0);
}

async function findAttempt(batchId: string) {
  const [result] = await database
    .select({ batch: schema.ideaGenerationBatches, run: schema.aiRuns })
    .from(schema.ideaGenerationBatches)
    .innerJoin(schema.aiRuns, eq(schema.ideaGenerationBatches.aiRunId, schema.aiRuns.id))
    .where(eq(schema.ideaGenerationBatches.id, batchId));

  if (!result) {
    throw new Error("Test attempt was not found.");
  }

  return result;
}

async function createManualAttempt(
  context: Awaited<ReturnType<typeof createContext>>,
  options: Readonly<{
    status: "PENDING" | "RUNNING";
    createdAt: Date;
    startedAt?: Date;
    invokedAt?: Date;
  }>,
) {
  const batchId = randomUUID();
  const runId = randomUUID();
  const idempotencyKey = randomUUID();
  const startedAt = options.startedAt ?? null;
  const [run] = await database
    .insert(schema.aiRuns)
    .values({
      id: runId,
      workspaceId: context.workspace.id,
      kind: "IDEA_GENERATION",
      provider: "avalai",
      model: "gpt-5.6-luna",
      promptVersion: "idea-generation/v1",
      generationSettings: ideaGenerationSettings,
      status: options.status,
      createdAt: options.createdAt,
      startedAt,
    })
    .returning();
  const [batch] = await database
    .insert(schema.ideaGenerationBatches)
    .values({
      id: batchId,
      workspaceId: context.workspace.id,
      contentDnaVersionId: context.dna.versionId,
      aiRunId: runId,
      idempotencyKey,
      requestFingerprint: "a".repeat(64),
      requestedLanguage: "en",
      requestedCount: 20,
      status: options.status,
      createdAt: options.createdAt,
      startedAt,
    })
    .returning();

  if (!run || !batch) {
    throw new Error("Test attempt creation did not return its pair.");
  }

  const [reservation] = await database
    .insert(schema.workspaceGenerationQuotaReservations)
    .values({
      workspaceId: context.workspace.id,
      batchId,
      reservedAt: options.createdAt,
      invokedAt: options.invokedAt,
    })
    .returning();

  if (!reservation) {
    throw new Error("Test reservation creation did not return a reservation.");
  }

  return { batch, run, reservation };
}

async function countIdeas(batchId: string): Promise<number> {
  const [result] = await database
    .select({ value: count() })
    .from(schema.ideas)
    .where(eq(schema.ideas.batchId, batchId));

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

describe("idea generation application service", () => {
  it("authorizes, starts after a committed RUNNING transition, and atomically persists exactly 20 ideas", async () => {
    const context = await createContext();
    const clock = createClock(new Date("2026-09-01T10:00:00.000Z"));
    const fake = new FakeGenerateIdeasProvider({
      recordRequests: true,
      usage: { totalTokens: 33 },
    });
    let observedProviderStatus: string | undefined;
    const provider = {
      generateIdeas: vi.fn(async (request: Parameters<typeof fake.generateIdeas>[0]) => {
        const [latestRun] = await database
          .select()
          .from(schema.aiRuns)
          .orderBy(desc(schema.aiRuns.createdAt))
          .limit(1);
        observedProviderStatus = latestRun?.status;
        return fake.generateIdeas(request);
      }),
    };
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => provider,
      clock: clock.now,
      logger: createLogger(),
    });

    const result = await service.generateIdeas(input(context));
    const attempt = await findAttempt(result.batch.id);

    expect(result).toMatchObject({
      replayed: false,
      batch: { status: "COMPLETED", requestedCount: 20 },
    });
    expect(observedProviderStatus).toBe("RUNNING");
    expect(provider.generateIdeas).toHaveBeenCalledOnce();
    expect(fake.invocationCount).toBe(1);
    expect(fake.lastRequest).toMatchObject({
      generationKind: "IDEA_GENERATION",
      requestedLanguage: "en",
      requestedCount: 20,
      promptVersion: "idea-generation/v1",
      contentDna: readyPayload,
    });
    expect(attempt.batch.status).toBe("COMPLETED");
    expect(attempt.run.status).toBe("COMPLETED");
    expect(attempt.run.outputSnapshot).toEqual(expect.objectContaining({ schemaVersion: 1 }));
    expect(attempt.run.usage).toEqual({ totalTokens: 33 });
    expect(await countIdeas(result.batch.id)).toBe(20);

    const persistedIdeas = await database
      .select({
        position: schema.ideas.position,
        language: schema.ideas.language,
        status: schema.ideas.status,
      })
      .from(schema.ideas)
      .where(eq(schema.ideas.batchId, result.batch.id))
      .orderBy(schema.ideas.position);
    expect(persistedIdeas.map((idea) => idea.position)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(new Set(persistedIdeas.map((idea) => idea.language))).toEqual(new Set(["en"]));
    expect(new Set(persistedIdeas.map((idea) => idea.status))).toEqual(new Set(["NEW"]));
    expect(await countRows(schema.workspaceGenerationQuotaReservations)).toBe(1);
  });

  it.each([
    ["unauthenticated", null, readyPayload, "en", "UNAUTHORIZED"],
    ["incomplete DNA", "owner", incompletePayload, "en", "VALIDATION_ERROR"],
    ["invalid language", "owner", readyPayload, "de", "VALIDATION_ERROR"],
  ] as const)(
    "rejects %s before creating records or calling the provider",
    async (_, auth, payload, language, code) => {
      const context = await createContext(payload);
      const fake = new FakeGenerateIdeasProvider();
      const service = createIdeaGenerationApplicationService({
        database,
        getAuthenticatedUserId: async () => (auth === null ? null : context.user.id),
        providerFactory: () => fake,
        logger: createLogger(),
      });

      await expect(
        service.generateIdeas(input(context, { requestedLanguage: language })),
      ).rejects.toMatchObject({ code });
      expect(fake.invocationCount).toBe(0);
      expect(await countRows(schema.ideaGenerationBatches)).toBe(0);
      expect(await countRows(schema.aiRuns)).toBe(0);
      expect(await countRows(schema.workspaceGenerationQuotaReservations)).toBe(0);
    },
  );

  it("rejects a non-owner before provider invocation and does not reveal private generation state", async () => {
    const context = await createContext();
    const otherUser = await createUser();
    const fake = new FakeGenerateIdeasProvider();
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => otherUser.id,
      providerFactory: () => fake,
      logger: createLogger(),
    });

    await expect(service.generateIdeas(input(context))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(fake.invocationCount).toBe(0);
    expect(await countRows(schema.ideaGenerationBatches)).toBe(0);
  });

  it("returns CONFLICT for a stale DNA base before quota or provider work", async () => {
    const context = await createContext();
    const newerVersionId = randomUUID();
    await database.transaction(async (transaction) => {
      await transaction.insert(schema.contentDnaVersions).values({
        id: newerVersionId,
        contentDnaId: context.dna.containerId,
        versionNumber: 2,
        payload: readyPayload,
        createdByUserId: context.user.id,
      });
      await transaction
        .update(schema.contentDna)
        .set({ currentVersionId: newerVersionId })
        .where(eq(schema.contentDna.id, context.dna.containerId));
    });
    const fake = new FakeGenerateIdeasProvider();
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => fake,
      logger: createLogger(),
    });

    await expect(service.generateIdeas(input(context))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fake.invocationCount).toBe(0);
    expect(await countRows(schema.ideaGenerationBatches)).toBe(0);
    expect(await countRows(schema.aiRuns)).toBe(0);
    expect(await countRows(schema.workspaceGenerationQuotaReservations)).toBe(0);
  });

  it("continues an accepted v4 operation with immutable v4 after current DNA advances to v5", async () => {
    const context = await createContext();
    const fake = new FakeGenerateIdeasProvider({ recordRequests: true });
    const newerVersionId = randomUUID();
    const newerPayload = parseContentDnaPayload({
      ...readyPayload,
      identity: { creatorOrBrandDescription: "A changed creator identity for version five." },
    });
    let acceptedBatchStatus: string | undefined;

    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: async () => {
        const [acceptedBatch] = await database.select().from(schema.ideaGenerationBatches).limit(1);
        acceptedBatchStatus = acceptedBatch?.status;

        await database.transaction(async (transaction) => {
          await transaction.insert(schema.contentDnaVersions).values({
            id: newerVersionId,
            contentDnaId: context.dna.containerId,
            versionNumber: 2,
            payload: newerPayload,
            createdByUserId: context.user.id,
          });
          await transaction
            .update(schema.contentDna)
            .set({ currentVersionId: newerVersionId })
            .where(eq(schema.contentDna.id, context.dna.containerId));
        });

        return fake;
      },
      logger: createLogger(),
    });

    const result = await service.generateIdeas(input(context));
    const attempt = await findAttempt(result.batch.id);

    expect(fake.invocationCount).toBe(1);
    expect(acceptedBatchStatus).toBe("PENDING");
    expect(fake.lastRequest?.contentDna).toEqual(readyPayload);
    expect(result.batch).toMatchObject({
      contentDnaVersionId: context.dna.versionId,
      status: "COMPLETED",
    });
    expect(attempt.batch.contentDnaVersionId).toBe(context.dna.versionId);
    expect(attempt.batch.errorCategory).toBeNull();
    expect(await countIdeas(result.batch.id)).toBe(20);
  });

  it("replays the same workspace key and fingerprint without a second provider call or quota slot", async () => {
    const context = await createContext();
    const fake = new FakeGenerateIdeasProvider();
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => fake,
      logger: createLogger(),
    });
    const operation = input(context);

    const first = await service.generateIdeas(operation);
    const replay = await service.generateIdeas(operation);

    expect(first.batch.id).toBe(replay.batch.id);
    expect(replay.replayed).toBe(true);
    expect(fake.invocationCount).toBe(1);
    expect(await countRows(schema.ideaGenerationBatches)).toBe(1);
    expect(await countRows(schema.aiRuns)).toBe(1);
    expect(await countRows(schema.workspaceGenerationQuotaReservations)).toBe(1);
  });

  it("replays an existing operation without revalidating a DNA version that changed afterward", async () => {
    const context = await createContext();
    const fake = new FakeGenerateIdeasProvider();
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => fake,
      logger: createLogger(),
    });
    const operation = input(context);
    const first = await service.generateIdeas(operation);
    const newerVersionId = randomUUID();

    await database.transaction(async (transaction) => {
      await transaction.insert(schema.contentDnaVersions).values({
        id: newerVersionId,
        contentDnaId: context.dna.containerId,
        versionNumber: 2,
        payload: readyPayload,
        createdByUserId: context.user.id,
      });
      await transaction
        .update(schema.contentDna)
        .set({ currentVersionId: newerVersionId })
        .where(eq(schema.contentDna.id, context.dna.containerId));
    });

    const replay = await service.generateIdeas(operation);

    expect(replay).toMatchObject({
      replayed: true,
      batch: { id: first.batch.id, status: "COMPLETED" },
    });
    expect(fake.invocationCount).toBe(1);
  });

  it("rejects idempotency-key reuse with a different fingerprint before quota or provider work", async () => {
    const context = await createContext();
    const fake = new FakeGenerateIdeasProvider();
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => fake,
      logger: createLogger(),
    });
    const idempotencyKey = randomUUID();

    await service.generateIdeas(input(context, { idempotencyKey }));
    await expect(
      service.generateIdeas(input(context, { idempotencyKey, requestedLanguage: "fa" })),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(fake.invocationCount).toBe(1);
    expect(await countRows(schema.ideaGenerationBatches)).toBe(1);
    expect(await countRows(schema.workspaceGenerationQuotaReservations)).toBe(1);
  });

  it("does not create a record when workspace policy quota is full", async () => {
    const context = await createContext();
    const clock = createClock(new Date("2026-09-01T10:00:00.000Z"));
    const fake = new FakeGenerateIdeasProvider();
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => fake,
      clock: clock.now,
      logger: createLogger(),
    });

    await service.generateIdeas(input(context));
    await service.generateIdeas(input(context));
    await service.generateIdeas(input(context));
    await expect(service.generateIdeas(input(context))).rejects.toMatchObject({
      code: "RATE_LIMITED",
      rateLimitSource: "workspace",
    });

    expect(fake.invocationCount).toBe(3);
    expect(await countRows(schema.ideaGenerationBatches)).toBe(3);
    expect(await countRows(schema.aiRuns)).toBe(3);
    expect(await countRows(schema.workspaceGenerationQuotaReservations)).toBe(3);

    clock.set(new Date("2026-09-01T10:10:01.000Z"));
    await expect(service.generateIdeas(input(context))).resolves.toMatchObject({
      batch: { status: "COMPLETED" },
    });
    expect(fake.invocationCount).toBe(4);
  });

  it("enforces the 24-hour limit after the ten-minute window rolls over", async () => {
    const context = await createContext();
    const clock = createClock(new Date("2026-09-01T10:00:00.000Z"));
    const fake = new FakeGenerateIdeasProvider();
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => fake,
      clock: clock.now,
      logger: createLogger(),
    });

    for (let index = 0; index < 12; index += 1) {
      await service.generateIdeas(input(context));
      clock.set(new Date(clock.now().getTime() + 10 * 60 * 1_000 + 1));
    }
    await expect(service.generateIdeas(input(context))).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(fake.invocationCount).toBe(12);
  });

  it.each([
    ["timeout", "PROVIDER_ERROR", "TIMEOUT"],
    ["rate-limited", "RATE_LIMITED", "RATE_LIMITED"],
    ["provider-unavailable", "PROVIDER_ERROR", "PROVIDER_UNAVAILABLE"],
    ["invalid-output", "AI_OUTPUT_INVALID", "INVALID_OUTPUT"],
    ["unknown", "PROVIDER_ERROR", "UNKNOWN"],
  ] as const)(
    "maps provider %s to a safe failed pair and application error",
    async (scenario, code, category) => {
      const context = await createContext();
      const fake = new FakeGenerateIdeasProvider({ scenario });
      const service = createIdeaGenerationApplicationService({
        database,
        getAuthenticatedUserId: async () => context.user.id,
        providerFactory: () => fake,
        logger: createLogger(),
      });

      const request = input(context);
      await expect(service.generateIdeas(request)).rejects.toMatchObject({
        code,
        ...(category === "RATE_LIMITED" ? { rateLimitSource: "provider" } : {}),
      });
      expect(fake.invocationCount).toBe(1);
      expect(await countRows(schema.ideas)).toBe(0);
      expect(await countRows(schema.workspaceGenerationQuotaReservations)).toBe(1);

      const [batch] = await database
        .select()
        .from(schema.ideaGenerationBatches)
        .where(eq(schema.ideaGenerationBatches.idempotencyKey, request.idempotencyKey));
      if (!batch) {
        throw new Error("Failed test batch was not persisted.");
      }
      const attempt = await findAttempt(batch.id);
      expect(attempt.batch.status).toBe("FAILED");
      expect(attempt.batch.errorCategory).toBe(category);
      expect(attempt.run.status).toBe("FAILED");
      expect(attempt.run.errorCategory).toBe(category);
      expect(attempt.run.outputSnapshot).toBeNull();
    },
  );

  it("returns the original failed operation on same-key replay without retrying the provider", async () => {
    const context = await createContext();
    const fake = new FakeGenerateIdeasProvider({ scenario: "timeout" });
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => fake,
      logger: createLogger(),
    });
    const operation = input(context);

    await expect(service.generateIdeas(operation)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    const replay = await service.generateIdeas(operation);

    expect(replay).toMatchObject({
      replayed: true,
      batch: { status: "FAILED", errorCategory: "TIMEOUT" },
    });
    expect(fake.invocationCount).toBe(1);
  });

  it("converts a provider throw into UNKNOWN without leaking the thrown value", async () => {
    const context = await createContext();
    const secretError = new Error("provider secret response body");
    const log = createLogger();
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => ({ generateIdeas: vi.fn().mockRejectedValue(secretError) }),
      logger: log,
    });

    await expect(service.generateIdeas(input(context))).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Idea generation could not be completed.",
    });
    const [run] = await database.select().from(schema.aiRuns);
    const [batch] = await database.select().from(schema.ideaGenerationBatches);
    expect(run?.errorCategory).toBe("UNKNOWN");
    expect(log.warn).toHaveBeenCalledWith(
      "ideas.generate.failed",
      expect.objectContaining({
        entityId: batch?.id,
        aiRunId: run?.id,
        transition: "RUNNING->FAILED",
        errorCategory: "UNKNOWN",
        errorCode: "PROVIDER_ERROR",
      }),
    );
  });

  it("recovers stale PENDING without consuming quota and stale RUNNING while retaining invoked quota", async () => {
    const context = await createContext();
    const now = new Date("2026-09-01T10:00:00.000Z");
    const stale = new Date(now.getTime() - 75_001);
    const pending = await createManualAttempt(context, { status: "PENDING", createdAt: stale });
    const running = await createManualAttempt(context, {
      status: "RUNNING",
      createdAt: stale,
      startedAt: stale,
      invokedAt: stale,
    });
    const fake = new FakeGenerateIdeasProvider();
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => fake,
      clock: () => now,
      logger: createLogger(),
    });

    await expect(
      service.recoverStaleAttempts({ workspaceId: context.workspace.id }),
    ).resolves.toEqual({
      recovered: 2,
    });
    const pendingAttempt = await findAttempt(pending.batch.id);
    const runningAttempt = await findAttempt(running.batch.id);
    const [pendingReservation] = await database
      .select()
      .from(schema.workspaceGenerationQuotaReservations)
      .where(eq(schema.workspaceGenerationQuotaReservations.batchId, pending.batch.id));
    const [runningReservation] = await database
      .select()
      .from(schema.workspaceGenerationQuotaReservations)
      .where(eq(schema.workspaceGenerationQuotaReservations.batchId, running.batch.id));

    expect(pendingAttempt.batch).toMatchObject({ status: "FAILED", errorCategory: "INTERRUPTED" });
    expect(pendingAttempt.run).toMatchObject({ status: "FAILED", errorCategory: "INTERRUPTED" });
    expect(runningAttempt.batch).toMatchObject({ status: "FAILED", errorCategory: "INTERRUPTED" });
    expect(runningAttempt.run).toMatchObject({ status: "FAILED", errorCategory: "INTERRUPTED" });
    expect(pendingReservation?.invokedAt).toBeNull();
    expect(pendingReservation?.releasedAt).toEqual(now);
    expect(runningReservation?.invokedAt).toEqual(stale);
    expect(runningReservation?.releasedAt).toBeNull();
    expect(fake.invocationCount).toBe(0);
  });

  it("leaves non-stale attempts untouched", async () => {
    const context = await createContext();
    const now = new Date("2026-09-01T10:00:00.000Z");
    const recent = new Date(now.getTime() - 75_000 + 1);
    const pending = await createManualAttempt(context, { status: "PENDING", createdAt: recent });
    const running = await createManualAttempt(context, {
      status: "RUNNING",
      createdAt: recent,
      startedAt: recent,
      invokedAt: recent,
    });
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => new FakeGenerateIdeasProvider(),
      clock: () => now,
      logger: createLogger(),
    });

    await expect(
      service.recoverStaleAttempts({ workspaceId: context.workspace.id }),
    ).resolves.toEqual({
      recovered: 0,
    });
    expect((await findAttempt(pending.batch.id)).batch.status).toBe("PENDING");
    expect((await findAttempt(running.batch.id)).batch.status).toBe("RUNNING");
  });

  it("discards a late provider success after stale recovery", async () => {
    const context = await createContext();
    const clock = createClock(new Date("2026-09-01T10:00:00.000Z"));
    const fake = new FakeGenerateIdeasProvider();
    let providerStarted!: () => void;
    let releaseProvider!: (value: Awaited<ReturnType<typeof fake.generateIdeas>>) => void;
    const providerReady = new Promise<void>((resolve) => {
      providerStarted = resolve;
    });
    const providerResult = new Promise<Awaited<ReturnType<typeof fake.generateIdeas>>>(
      (resolve) => {
        releaseProvider = resolve;
      },
    );
    const provider = {
      generateIdeas: vi.fn(async () => {
        providerStarted();
        return providerResult;
      }),
    };
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => provider,
      clock: clock.now,
      logger: createLogger(),
    });

    const operation = input(context);
    const generation = service.generateIdeas(operation);
    await providerReady;
    clock.set(new Date("2026-09-01T10:01:16.000Z"));
    await expect(
      service.recoverStaleAttempts({ workspaceId: context.workspace.id }),
    ).resolves.toEqual({
      recovered: 1,
    });
    releaseProvider(
      await fake.generateIdeas({
        generationKind: "IDEA_GENERATION",
        contentDna: readyPayload,
        requestedLanguage: "en",
        requestedCount: 20,
        promptVersion: "idea-generation/v1",
      }),
    );

    await expect(generation).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    const [batch] = await database
      .select()
      .from(schema.ideaGenerationBatches)
      .where(eq(schema.ideaGenerationBatches.idempotencyKey, operation.idempotencyKey));
    expect(batch?.status).toBe("FAILED");
    expect(await countIdeas(batch!.id)).toBe(0);
    expect(provider.generateIdeas).toHaveBeenCalledOnce();
  });

  it("lets completion or recovery win the terminal race without an inconsistent pair", async () => {
    const context = await createContext();
    const clock = createClock(new Date("2026-09-01T10:00:00.000Z"));
    const fake = new FakeGenerateIdeasProvider();
    let providerStarted!: () => void;
    let releaseProvider!: (value: Awaited<ReturnType<typeof fake.generateIdeas>>) => void;
    const providerReady = new Promise<void>((resolve) => {
      providerStarted = resolve;
    });
    const providerResult = new Promise<Awaited<ReturnType<typeof fake.generateIdeas>>>(
      (resolve) => {
        releaseProvider = resolve;
      },
    );
    const provider = {
      generateIdeas: vi.fn(async () => {
        providerStarted();
        return providerResult;
      }),
    };
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => provider,
      clock: clock.now,
      logger: createLogger(),
    });
    const operation = input(context);
    const generation = service.generateIdeas(operation);

    await providerReady;
    clock.set(new Date("2026-09-01T10:01:16.000Z"));
    releaseProvider(
      await fake.generateIdeas({
        generationKind: "IDEA_GENERATION",
        contentDna: readyPayload,
        requestedLanguage: "en",
        requestedCount: 20,
        promptVersion: "idea-generation/v1",
      }),
    );

    const [generationResult, recoveryResult] = await Promise.allSettled([
      generation,
      service.recoverStaleAttempts({ workspaceId: context.workspace.id }),
    ]);
    const [batch] = await database
      .select()
      .from(schema.ideaGenerationBatches)
      .where(eq(schema.ideaGenerationBatches.idempotencyKey, operation.idempotencyKey));
    const attempt = await findAttempt(batch!.id);

    expect(attempt.batch.status).toBe(attempt.run.status);
    expect(["COMPLETED", "FAILED"]).toContain(attempt.batch.status);
    if (attempt.batch.status === "COMPLETED") {
      expect(generationResult.status).toBe("fulfilled");
      expect(recoveryResult).toMatchObject({ status: "fulfilled", value: { recovered: 0 } });
      expect(await countIdeas(batch!.id)).toBe(20);
    } else {
      expect(generationResult).toMatchObject({
        status: "rejected",
        reason: { code: "PROVIDER_ERROR" },
      });
      expect(recoveryResult).toMatchObject({ status: "fulfilled", value: { recovered: 1 } });
      expect(await countIdeas(batch!.id)).toBe(0);
    }
  });

  it("converges concurrent same-key requests on one operation and one provider invocation", async () => {
    const context = await createContext();
    const fake = new FakeGenerateIdeasProvider();
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => fake,
      logger: createLogger(),
    });
    const operation = input(context);

    const results = await Promise.all([
      service.generateIdeas(operation),
      service.generateIdeas(operation),
    ]);

    expect(new Set(results.map((result) => result.batch.id))).toHaveLength(1);
    expect(fake.invocationCount).toBe(1);
    expect(await countRows(schema.ideaGenerationBatches)).toBe(1);
    expect(await countRows(schema.workspaceGenerationQuotaReservations)).toBe(1);
  });

  it("allows the same idempotency key in different workspaces", async () => {
    const first = await createContext();
    const second = await createContext();
    const firstFake = new FakeGenerateIdeasProvider();
    const secondFake = new FakeGenerateIdeasProvider();
    const firstService = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => first.user.id,
      providerFactory: () => firstFake,
      logger: createLogger(),
    });
    const secondService = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => second.user.id,
      providerFactory: () => secondFake,
      logger: createLogger(),
    });
    const idempotencyKey = randomUUID();

    await expect(
      firstService.generateIdeas(input(first, { idempotencyKey })),
    ).resolves.toMatchObject({ batch: { status: "COMPLETED" } });
    await expect(
      secondService.generateIdeas(input(second, { idempotencyKey })),
    ).resolves.toMatchObject({ batch: { status: "COMPLETED" } });

    expect(firstFake.invocationCount).toBe(1);
    expect(secondFake.invocationCount).toBe(1);
    expect(await countRows(schema.ideaGenerationBatches)).toBe(2);
  });

  it("does not exceed the rolling quota under concurrent new keys", async () => {
    const context = await createContext();
    const fake = new FakeGenerateIdeasProvider();
    const service = createIdeaGenerationApplicationService({
      database,
      getAuthenticatedUserId: async () => context.user.id,
      providerFactory: () => fake,
      logger: createLogger(),
    });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => service.generateIdeas(input(context))),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(2);
    expect(
      results
        .filter((result) => result.status === "rejected")
        .every(
          (result) =>
            result.reason instanceof ApplicationError && result.reason.code === "RATE_LIMITED",
        ),
    ).toBe(true);
    expect(fake.invocationCount).toBe(3);
    expect(await countRows(schema.ideaGenerationBatches)).toBe(3);
    expect(await countRows(schema.workspaceGenerationQuotaReservations)).toBe(3);
  });
});
