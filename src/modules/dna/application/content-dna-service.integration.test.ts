import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import type { ContentDnaPayload } from "@/modules/dna/domain/content-dna-payload";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth/server", () => ({ getServerSession: vi.fn() }));

import { createContentDnaApplicationService } from "./content-dna-service";

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });
const partialPayload = { schemaVersion: 1, identity: { creatorOrBrandDescription: "Creator" } } satisfies ContentDnaPayload;
const aiReadyPayload = {
  schemaVersion: 1,
  identity: { creatorOrBrandDescription: "Creator" },
  audience: { targetAudienceDescription: "Creators who want consistent content" },
  expertise: { primaryTopics: ["Content strategy"] },
  voice: { toneTraits: ["Practical"] },
  goals: { contentGoals: ["Teach creators"] },
  language: { defaultContentLanguage: "en", contentLanguages: ["en"] },
} satisfies ContentDnaPayload;

async function createUser(email: string): Promise<typeof schema.user.$inferSelect> {
  const [user] = await database
    .insert(schema.user)
    .values({ id: randomUUID(), name: "Creator", email })
    .returning();

  if (!user) {
    throw new Error("Test user creation did not return a user.");
  }

  return user;
}

async function createWorkspaceForUser(userId: string): Promise<typeof schema.workspaces.$inferSelect> {
  const [workspace] = await database.insert(schema.workspaces).values({ name: "Workspace" }).returning();

  if (!workspace) {
    throw new Error("Test workspace creation did not return a workspace.");
  }

  await database.insert(schema.workspaceMembers).values({ workspaceId: workspace.id, userId, role: "owner" });
  return workspace;
}

async function countVersions(): Promise<number> {
  const [result] = await database.select({ value: count() }).from(schema.contentDnaVersions);

  return result?.value ?? 0;
}

async function countContainers(): Promise<number> {
  const [result] = await database.select({ value: count() }).from(schema.contentDna);

  return result?.value ?? 0;
}

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "drizzle" });
});

beforeEach(async () => {
  await database.execute('TRUNCATE TABLE "content_dna_versions", "content_dna", "workspace_members", "workspaces", "user" CASCADE');
});

afterAll(async () => {
  await pool.end();
});

describe("Content DNA application services", () => {
  it("returns NOT_CREATED for an authorized workspace without Content DNA", async () => {
    const owner = await createUser("current-not-created@example.com");
    const workspace = await createWorkspaceForUser(owner.id);
    const service = createContentDnaApplicationService({
      database,
      getAuthenticatedUserId: async () => owner.id,
    });

    await expect(service.getCurrentContentDna({ workspaceId: workspace.id })).resolves.toEqual({
      status: "NOT_CREATED",
      currentVersion: null,
    });
  });

  it("creates version 1 from a storage-valid partial first save", async () => {
    const owner = await createUser("first-partial-save@example.com");
    const workspace = await createWorkspaceForUser(owner.id);
    const service = createContentDnaApplicationService({
      database,
      getAuthenticatedUserId: async () => owner.id,
    });

    const saved = await service.saveContentDna({
      workspaceId: workspace.id,
      baseVersionId: null,
      payload: partialPayload,
    });

    expect(saved).toMatchObject({
      versionNumber: 1,
      payload: partialPayload,
      readiness: "INCOMPLETE",
      isCurrent: true,
    });
    await expect(service.getCurrentContentDna({ workspaceId: workspace.id })).resolves.toMatchObject({
      status: "INCOMPLETE",
      currentVersion: { id: saved.id, versionNumber: 1 },
    });
  });

  it("creates an AI-ready version 1 and derives its readiness", async () => {
    const owner = await createUser("first-ready-save@example.com");
    const workspace = await createWorkspaceForUser(owner.id);
    const service = createContentDnaApplicationService({
      database,
      getAuthenticatedUserId: async () => owner.id,
    });

    const saved = await service.saveContentDna({ workspaceId: workspace.id, baseVersionId: null, payload: aiReadyPayload });

    expect(saved).toMatchObject({ versionNumber: 1, readiness: "AI_READY", isCurrent: true });
    await expect(service.getCurrentContentDna({ workspaceId: workspace.id })).resolves.toMatchObject({ status: "AI_READY" });
  });

  it("allows a workspace member to read saved Content DNA", async () => {
    const owner = await createUser("member-read@example.com");
    const workspace = await createWorkspaceForUser(owner.id);
    const service = createContentDnaApplicationService({
      database,
      getAuthenticatedUserId: async () => owner.id,
    });

    const saved = await service.saveContentDna({ workspaceId: workspace.id, baseVersionId: null, payload: partialPayload });

    await expect(service.getCurrentContentDna({ workspaceId: workspace.id })).resolves.toMatchObject({
      currentVersion: { id: saved.id, payload: partialPayload },
    });
  });

  it("rejects unauthenticated and unrelated-user reads without revealing Content DNA", async () => {
    const owner = await createUser("private-read-owner@example.com");
    const otherUser = await createUser("private-read-other@example.com");
    const workspace = await createWorkspaceForUser(owner.id);
    const ownerService = createContentDnaApplicationService({ database, getAuthenticatedUserId: async () => owner.id });
    const unauthenticatedService = createContentDnaApplicationService({ database, getAuthenticatedUserId: async () => null });
    const otherService = createContentDnaApplicationService({ database, getAuthenticatedUserId: async () => otherUser.id });

    await ownerService.saveContentDna({ workspaceId: workspace.id, baseVersionId: null, payload: partialPayload });

    await expect(unauthenticatedService.getCurrentContentDna({ workspaceId: workspace.id })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(otherService.getCurrentContentDna({ workspaceId: workspace.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an unrelated user from mutating Content DNA", async () => {
    const owner = await createUser("private-mutation-owner@example.com");
    const otherUser = await createUser("private-mutation-other@example.com");
    const workspace = await createWorkspaceForUser(owner.id);
    const otherService = createContentDnaApplicationService({ database, getAuthenticatedUserId: async () => otherUser.id });

    await expect(
      otherService.saveContentDna({ workspaceId: workspace.id, baseVersionId: null, payload: partialPayload }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await countVersions()).toBe(0);
  });

  it("logs save outcomes with safe identifiers and never the payload", async () => {
    const owner = await createUser("payload-safe-logging@example.com");
    const workspace = await createWorkspaceForUser(owner.id);
    const serviceLogger = { info: vi.fn(), warn: vi.fn() };
    const service = createContentDnaApplicationService({
      database,
      getAuthenticatedUserId: async () => owner.id,
      logger: serviceLogger,
    });
    const privatePayload = {
      schemaVersion: 1,
      identity: { creatorOrBrandDescription: "Private creator instructions must not be logged" },
    } satisfies ContentDnaPayload;

    await service.saveContentDna({ workspaceId: workspace.id, baseVersionId: null, payload: privatePayload });

    expect(serviceLogger.info).toHaveBeenCalledWith("dna.save.succeeded", {
      userId: owner.id,
      workspaceId: workspace.id,
      module: "dna",
      operation: "saveContentDna",
    });
    expect(JSON.stringify(serviceLogger.info.mock.calls)).not.toContain("Private creator instructions");
    expect(serviceLogger.warn).not.toHaveBeenCalled();
  });

  it("returns history and individual versions without exposing persistence rows", async () => {
    const owner = await createUser("history-and-detail@example.com");
    const workspace = await createWorkspaceForUser(owner.id);
    const service = createContentDnaApplicationService({
      database,
      getAuthenticatedUserId: async () => owner.id,
    });
    const first = await service.saveContentDna({ workspaceId: workspace.id, baseVersionId: null, payload: partialPayload });
    const second = await service.saveContentDna({ workspaceId: workspace.id, baseVersionId: first.id, payload: aiReadyPayload });

    await expect(service.listContentDnaVersions({ workspaceId: workspace.id })).resolves.toMatchObject([
      { id: second.id, versionNumber: 2, isCurrent: true, readiness: "AI_READY" },
      { id: first.id, versionNumber: 1, isCurrent: false, readiness: "INCOMPLETE" },
    ]);
    await expect(service.getContentDnaVersion({ workspaceId: workspace.id, versionId: first.id })).resolves.toMatchObject({
      id: first.id,
      payload: partialPayload,
      isCurrent: false,
    });
  });

  it("does not disclose a version that belongs to another workspace", async () => {
    const owner = await createUser("version-owner@example.com");
    const otherUser = await createUser("version-other@example.com");
    const ownerWorkspace = await createWorkspaceForUser(owner.id);
    const otherWorkspace = await createWorkspaceForUser(otherUser.id);
    const ownerService = createContentDnaApplicationService({ database, getAuthenticatedUserId: async () => owner.id });
    const otherService = createContentDnaApplicationService({ database, getAuthenticatedUserId: async () => otherUser.id });
    const saved = await ownerService.saveContentDna({
      workspaceId: ownerWorkspace.id,
      baseVersionId: null,
      payload: partialPayload,
    });

    await expect(
      otherService.getContentDnaVersion({ workspaceId: otherWorkspace.id, versionId: saved.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the current version without artificial history for an identical normalized save", async () => {
    const owner = await createUser("identical-save@example.com");
    const workspace = await createWorkspaceForUser(owner.id);
    const service = createContentDnaApplicationService({
      database,
      getAuthenticatedUserId: async () => owner.id,
    });
    const first = await service.saveContentDna({ workspaceId: workspace.id, baseVersionId: null, payload: partialPayload });

    const repeated = await service.saveContentDna({
      workspaceId: workspace.id,
      baseVersionId: first.id,
      payload: { schemaVersion: 1, identity: { creatorOrBrandDescription: "  Creator  " } },
    });

    expect(repeated.id).toBe(first.id);
    expect(repeated.versionNumber).toBe(1);
    expect(await countVersions()).toBe(1);
  });

  it("creates exactly N + 1 for a changed save and rejects a stale base version", async () => {
    const owner = await createUser("changed-and-stale@example.com");
    const workspace = await createWorkspaceForUser(owner.id);
    const service = createContentDnaApplicationService({
      database,
      getAuthenticatedUserId: async () => owner.id,
    });
    const first = await service.saveContentDna({ workspaceId: workspace.id, baseVersionId: null, payload: partialPayload });
    const second = await service.saveContentDna({ workspaceId: workspace.id, baseVersionId: first.id, payload: aiReadyPayload });

    expect(second.versionNumber).toBe(2);
    await expect(
      service.saveContentDna({ workspaceId: workspace.id, baseVersionId: first.id, payload: partialPayload }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await countVersions()).toBe(2);
  });

  it("serializes concurrent first saves into one version-1 winner and one conflict", async () => {
    const owner = await createUser("concurrent-first-save@example.com");
    const workspace = await createWorkspaceForUser(owner.id);
    const service = createContentDnaApplicationService({
      database,
      getAuthenticatedUserId: async () => owner.id,
    });

    const results = await Promise.allSettled([
      service.saveContentDna({ workspaceId: workspace.id, baseVersionId: null, payload: partialPayload }),
      service.saveContentDna({ workspaceId: workspace.id, baseVersionId: null, payload: aiReadyPayload }),
    ]);

    const winner = results.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof service.saveContentDna>>> => result.status === "fulfilled");

    expect(winner).toMatchObject({ status: "fulfilled", value: { versionNumber: 1 } });
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toMatchObject({ code: "CONFLICT" });
    expect(await countContainers()).toBe(1);
    expect(await countVersions()).toBe(1);
    const [container] = await database.select().from(schema.contentDna).where(eq(schema.contentDna.workspaceId, workspace.id));
    expect(container?.currentVersionId).toBe(winner?.value.id);
  });

  it("serializes concurrent updates from one base into one successor and one conflict", async () => {
    const owner = await createUser("concurrent-update@example.com");
    const workspace = await createWorkspaceForUser(owner.id);
    const service = createContentDnaApplicationService({
      database,
      getAuthenticatedUserId: async () => owner.id,
    });
    const first = await service.saveContentDna({ workspaceId: workspace.id, baseVersionId: null, payload: partialPayload });

    const results = await Promise.allSettled([
      service.saveContentDna({ workspaceId: workspace.id, baseVersionId: first.id, payload: aiReadyPayload }),
      service.saveContentDna({
        workspaceId: workspace.id,
        baseVersionId: first.id,
        payload: { ...partialPayload, identity: { creatorOrBrandDescription: "Different creator" } },
      }),
    ]);

    const winner = results.find((result) => result.status === "fulfilled");

    expect(winner).toMatchObject({ status: "fulfilled", value: { versionNumber: 2 } });
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toMatchObject({ code: "CONFLICT" });
    expect(await countVersions()).toBe(2);
    await expect(service.getCurrentContentDna({ workspaceId: workspace.id })).resolves.toMatchObject({
      currentVersion: { id: winner?.status === "fulfilled" ? winner.value.id : "" },
    });
  });

  it("creates sequential versions only when the caller uses the latest returned base", async () => {
    const owner = await createUser("sequential-update@example.com");
    const workspace = await createWorkspaceForUser(owner.id);
    const service = createContentDnaApplicationService({
      database,
      getAuthenticatedUserId: async () => owner.id,
    });
    const first = await service.saveContentDna({ workspaceId: workspace.id, baseVersionId: null, payload: partialPayload });
    const second = await service.saveContentDna({ workspaceId: workspace.id, baseVersionId: first.id, payload: aiReadyPayload });
    const third = await service.saveContentDna({
      workspaceId: workspace.id,
      baseVersionId: second.id,
      payload: { ...aiReadyPayload, voice: { toneTraits: ["Direct"] } },
    });

    expect(third.versionNumber).toBe(3);
    expect(await countVersions()).toBe(3);
  });

  it("keeps historical payloads unchanged after later saves", async () => {
    const owner = await createUser("immutable-history@example.com");
    const workspace = await createWorkspaceForUser(owner.id);
    const service = createContentDnaApplicationService({
      database,
      getAuthenticatedUserId: async () => owner.id,
    });
    const first = await service.saveContentDna({ workspaceId: workspace.id, baseVersionId: null, payload: partialPayload });
    await service.saveContentDna({ workspaceId: workspace.id, baseVersionId: first.id, payload: aiReadyPayload });

    await expect(service.getContentDnaVersion({ workspaceId: workspace.id, versionId: first.id })).resolves.toMatchObject({
      payload: partialPayload,
      isCurrent: false,
    });
  });
});
