import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getServerEnvironment } from "@/lib/env/server";
import * as schema from "./schema";

const globalForDatabase = globalThis as typeof globalThis & {
  betterContentDatabasePool?: Pool;
};

const pool =
  globalForDatabase.betterContentDatabasePool ??
  new Pool({ connectionString: getServerEnvironment().DATABASE_URL });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.betterContentDatabasePool = pool;
}

export const db = drizzle({ client: pool, schema });
