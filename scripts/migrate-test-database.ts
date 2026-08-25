import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { getTestDatabaseUrl } from "../src/db/test-environment";

const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool });

try {
  await migrate(database, { migrationsFolder: "drizzle" });
  await database.execute("select 1 from workspaces limit 1");
  await database.execute("select 1 from workspace_members limit 1");
  console.info("Test database migration applied successfully.");
} finally {
  await pool.end();
}
