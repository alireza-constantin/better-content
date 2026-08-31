import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";

import { parseContentDnaPayload } from "./content-dna-payload";

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });
const snapshotPayload = parseContentDnaPayload({
  schemaVersion: 1,
  identity: { creatorOrBrandDescription: "Creator" },
});

async function createUser(email: string): Promise<typeof schema.user.$inferSelect> {
  const [createdUser] = await database
    .insert(schema.user)
    .values({ id: randomUUID(), name: "Creator", email })
    .returning();

  if (!createdUser) {
    throw new Error("Test user creation did not return a user.");
  }

  return createdUser;
}

async function createWorkspace(): Promise<typeof schema.workspaces.$inferSelect> {
  const [workspace] = await database
    .insert(schema.workspaces)
    .values({ name: "Workspace" })
    .returning();

  if (!workspace) {
    throw new Error("Test workspace creation did not return a workspace.");
  }

  return workspace;
}

async function createContentDna(
  workspaceId: string,
  createdByUserId: string,
): Promise<Readonly<{ contentDnaId: string; versionId: string }>> {
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
      payload: snapshotPayload,
      createdByUserId,
    });
  });

  return { contentDnaId, versionId };
}

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "drizzle" });
});

beforeEach(async () => {
  await database.execute(
    'TRUNCATE TABLE "content_dna_versions", "content_dna", "workspace_members", "workspaces", "user" CASCADE',
  );
});

afterAll(async () => {
  await pool.end();
});

describe("Content DNA persistence invariants", () => {
  it("establishes a valid first DNA/version pair in one transaction", async () => {
    const user = await createUser("first-content-dna@example.com");
    const workspace = await createWorkspace();
    const { contentDnaId, versionId } = await createContentDna(workspace.id, user.id);

    const [container] = await database
      .select()
      .from(schema.contentDna)
      .where(eq(schema.contentDna.id, contentDnaId));
    const [version] = await database
      .select()
      .from(schema.contentDnaVersions)
      .where(eq(schema.contentDnaVersions.id, versionId));

    expect(container?.currentVersionId).toBe(versionId);
    expect(version?.contentDnaId).toBe(contentDnaId);
    expect(version?.versionNumber).toBe(1);
  });

  it("rejects commit when current_version_id references no version", async () => {
    const workspace = await createWorkspace();

    await expect(
      database.transaction(async (transaction) => {
        await transaction.insert(schema.contentDna).values({
          id: randomUUID(),
          workspaceId: workspace.id,
          currentVersionId: randomUUID(),
        });
      }),
    ).rejects.toThrow();
  });

  it("rejects a current version belonging to another DNA", async () => {
    const user = await createUser("same-container-content-dna@example.com");
    const firstWorkspace = await createWorkspace();
    const secondWorkspace = await createWorkspace();
    const first = await createContentDna(firstWorkspace.id, user.id);
    const second = await createContentDna(secondWorkspace.id, user.id);

    await expect(
      database
        .update(schema.contentDna)
        .set({ currentVersionId: second.versionId })
        .where(eq(schema.contentDna.id, first.contentDnaId)),
    ).rejects.toThrow();

    const [current] = await database
      .select()
      .from(schema.contentDna)
      .where(eq(schema.contentDna.id, first.contentDnaId));

    expect(current?.currentVersionId).toBe(first.versionId);
  });

  it("enforces one container per workspace", async () => {
    const user = await createUser("unique-content-dna@example.com");
    const workspace = await createWorkspace();
    await createContentDna(workspace.id, user.id);

    await expect(createContentDna(workspace.id, user.id)).rejects.toThrow();
  });

  it("enforces unique version numbers per DNA", async () => {
    const user = await createUser("unique-version-content-dna@example.com");
    const workspace = await createWorkspace();
    const { contentDnaId } = await createContentDna(workspace.id, user.id);

    await database.insert(schema.contentDnaVersions).values({
      contentDnaId,
      versionNumber: 2,
      payload: snapshotPayload,
      createdByUserId: user.id,
    });

    await expect(
      database.insert(schema.contentDnaVersions).values({
        contentDnaId,
        versionNumber: 2,
        payload: snapshotPayload,
        createdByUserId: user.id,
      }),
    ).rejects.toThrow();

    await expect(
      database.insert(schema.contentDnaVersions).values({
        contentDnaId,
        versionNumber: 0,
        payload: snapshotPayload,
        createdByUserId: user.id,
      }),
    ).rejects.toThrow();
  });

  it("uses a deferred same-container FK without the redundant source unique", async () => {
    const foreignKey = await database.execute(sql`
      SELECT condeferrable, condeferred
      FROM pg_constraint
      WHERE conname = 'content_dna_current_version_same_container_fk'
    `);
    const redundantUnique = await database.execute(sql`
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'content_dna_id_current_version_id_unique'
    `);

    expect(foreignKey.rows).toEqual([{ condeferrable: true, condeferred: true }]);
    expect(redundantUnique.rows).toHaveLength(0);
  });

  it("prevents in-place mutation of an immutable snapshot", async () => {
    const user = await createUser("immutable-content-dna@example.com");
    const workspace = await createWorkspace();
    const { versionId } = await createContentDna(workspace.id, user.id);

    await expect(
      database
        .update(schema.contentDnaVersions)
        .set({
          payload: parseContentDnaPayload({
            schemaVersion: 1,
            identity: { creatorOrBrandDescription: "Changed" },
          }),
        })
        .where(eq(schema.contentDnaVersions.id, versionId)),
    ).rejects.toThrow();

    const [version] = await database
      .select({ payload: schema.contentDnaVersions.payload })
      .from(schema.contentDnaVersions)
      .where(eq(schema.contentDnaVersions.id, versionId));

    expect(version?.payload).toEqual(snapshotPayload);
  });
});
