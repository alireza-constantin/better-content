import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { parseServerEnvironment } from "./src/lib/env/schema";

const environment = parseServerEnvironment(process.env);
const pool = new Pool({ connectionString: environment.DATABASE_URL });
const database = drizzle({ client: pool });

export const auth = betterAuth({
  baseURL: environment.BETTER_AUTH_URL,
  secret: environment.BETTER_AUTH_SECRET,
  database: drizzleAdapter(database, {
    provider: "pg",
  }),
});
