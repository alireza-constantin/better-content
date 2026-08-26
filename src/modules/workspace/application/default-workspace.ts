import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { workspaceMembers, workspaces } from "@/db/schema";
import { ApplicationError } from "@/lib/errors/app-error";

const defaultWorkspaceName = "Personal workspace";

export type Workspace = typeof workspaces.$inferSelect;

type WorkspaceDatabase = typeof db;
type WorkspaceQueryDatabase = Pick<WorkspaceDatabase, "select">;

async function findWorkspaceForUser(database: WorkspaceQueryDatabase, userId: string): Promise<Workspace | undefined> {
  const [result] = await database
    .select({ workspace: workspaces })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId));

  return result?.workspace;
}

/**
 * Gets the one V1 personal workspace for a user, repairing a missing workspace
 * on protected-app entry. The advisory lock avoids creating an orphaned workspace
 * when concurrent first requests race before the membership uniqueness check.
 */
export async function getOrCreateDefaultWorkspace(
  userId: string,
  database: WorkspaceDatabase = db,
): Promise<Workspace> {
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);

    const existingWorkspace = await findWorkspaceForUser(transaction, userId);

    if (existingWorkspace) {
      return existingWorkspace;
    }

    const [workspace] = await transaction
      .insert(workspaces)
      .values({ name: defaultWorkspaceName })
      .returning();

    if (!workspace) {
      throw new Error("Default workspace creation did not return a workspace.");
    }

    await transaction.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId,
      role: "owner",
    });

    return workspace;
  });
}

export async function requireWorkspaceMembership(
  userId: string,
  workspaceId: string,
  database: WorkspaceQueryDatabase = db,
): Promise<Workspace> {
  const [result] = await database
    .select({ workspace: workspaces })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)));

  if (!result) {
    throw new ApplicationError("FORBIDDEN", "The user is not a member of this workspace.");
  }

  return result.workspace;
}
