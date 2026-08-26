import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";
import { ApplicationError } from "@/lib/errors/app-error";

vi.mock("@/db", () => ({ db: {} }));

import { getOrCreateDefaultWorkspace, requireWorkspaceMembership } from "./default-workspace";

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });

async function createUser(email: string): Promise<typeof schema.user.$inferSelect> {
  const [createdUser] = await database
    .insert(schema.user)
    .values({
      id: randomUUID(),
      name: "Creator",
      email,
    })
    .returning();

  if (!createdUser) {
    throw new Error("Test user creation did not return a user.");
  }

  return createdUser;
}

async function countRows(table: typeof schema.workspaces | typeof schema.workspaceMembers): Promise<number> {
  const [result] = await database.select({ value: count() }).from(table);

  return result?.value ?? 0;
}

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "drizzle" });
});

beforeEach(async () => {
  await database.execute('TRUNCATE TABLE "workspace_members", "workspaces", "user" CASCADE');
});

afterAll(async () => {
  await pool.end();
});

describe("default workspace provisioning", () => {
  it("creates one workspace and one owner membership for a first request", async () => {
    const user = await createUser("first-provision@example.com");

    const workspace = await getOrCreateDefaultWorkspace(user.id, database);
    const [membership] = await database
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, user.id));

    expect(workspace.name).toBe("Personal workspace");
    expect(membership).toMatchObject({
      userId: user.id,
      workspaceId: workspace.id,
      role: "owner",
    });
    expect(await countRows(schema.workspaces)).toBe(1);
    expect(await countRows(schema.workspaceMembers)).toBe(1);
  });

  it("returns the same workspace without duplicate memberships on repeated requests", async () => {
    const user = await createUser("repeated-provision@example.com");

    const firstWorkspace = await getOrCreateDefaultWorkspace(user.id, database);
    const secondWorkspace = await getOrCreateDefaultWorkspace(user.id, database);

    expect(secondWorkspace.id).toBe(firstWorkspace.id);
    expect(await countRows(schema.workspaces)).toBe(1);
    expect(await countRows(schema.workspaceMembers)).toBe(1);
  });

  it("serializes concurrent first requests while preserving unique workspaces and memberships", async () => {
    const user = await createUser("concurrent-provision@example.com");

    const workspaces = await Promise.all(
      Array.from({ length: 12 }, () => getOrCreateDefaultWorkspace(user.id, database)),
    );

    expect(new Set(workspaces.map((workspace) => workspace.id))).toHaveLength(1);
    expect(await countRows(schema.workspaces)).toBe(1);
    expect(await countRows(schema.workspaceMembers)).toBe(1);
  });
});

describe("workspace membership authorization", () => {
  it("returns the workspace for its owner and rejects an unrelated authenticated user", async () => {
    const owner = await createUser("workspace-owner@example.com");
    const otherUser = await createUser("workspace-other@example.com");
    const workspace = await getOrCreateDefaultWorkspace(owner.id, database);

    await expect(requireWorkspaceMembership(owner.id, workspace.id, database)).resolves.toMatchObject({
      id: workspace.id,
    });
    await expect(requireWorkspaceMembership(otherUser.id, workspace.id, database)).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<ApplicationError>);
  });
});
