import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { getE2eDatabaseUrl } from "../src/db/e2e-environment";

type EnvironmentValues = Readonly<Record<string, string | undefined>>;

function getDatabaseName(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname).replace(/^\/+/, "");
}

function getMaintenanceDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = "/postgres";

  return url.toString();
}

async function ensureE2eDatabase(databaseUrl: string): Promise<void> {
  const databaseName = getDatabaseName(databaseUrl);

  if (!/^[A-Za-z][A-Za-z0-9_]*_test$/i.test(databaseName)) {
    throw new Error("E2E_DATABASE_URL must use a simple database name ending in _test.");
  }

  const maintenanceClient = new Client({
    connectionString: getMaintenanceDatabaseUrl(databaseUrl),
  });

  await maintenanceClient.connect();

  try {
    const result = await maintenanceClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      databaseName,
    ]);

    if (result.rowCount === 0) {
      await maintenanceClient.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await maintenanceClient.end();
  }
}

/**
 * Provisions and clears only the guarded E2E database. Migrations run before
 * cleanup so a fresh machine never depends on pre-existing developer state.
 */
export async function resetE2eDatabase(environment: EnvironmentValues): Promise<string> {
  const databaseUrl = getE2eDatabaseUrl(environment);

  await ensureE2eDatabase(databaseUrl);

  const pool = new Pool({ connectionString: databaseUrl });
  const database = drizzle({ client: pool });

  try {
    await migrate(database, { migrationsFolder: "drizzle" });
    await database.execute(
      'TRUNCATE TABLE "workspace_members", "workspaces", "session", "account", "verification", "user" CASCADE',
    );
  } finally {
    await pool.end();
  }

  return databaseUrl;
}
