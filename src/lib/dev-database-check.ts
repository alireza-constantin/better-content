import { Client } from "pg";

const requiredApplicationTables = [
  "account",
  "session",
  "user",
  "verification",
  "workspaces",
  "workspace_members",
] as const;

const migrationsTable = "__drizzle_migrations";

type DatabaseRow = Readonly<Record<string, unknown>>;

export interface DatabaseClient {
  connect(): Promise<void>;
  query(statement: string): Promise<{ rows: readonly DatabaseRow[] }>;
  end(): Promise<void>;
}

export type DatabaseClientFactory = (connectionString: string) => DatabaseClient;

export type DatabaseCheckCode =
  | "READY"
  | "MISSING_CONFIGURATION"
  | "INVALID_CONFIGURATION"
  | "UNREACHABLE"
  | "DATABASE_NOT_FOUND"
  | "DATABASE_IDENTITY_MISMATCH"
  | "SCHEMA_MISSING"
  | "DATABASE_ERROR";

export type DatabaseCheckResult =
  | {
      ok: true;
      code: "READY";
      target: DatabaseTarget;
      message: string;
    }
  | {
      ok: false;
      code: Exclude<DatabaseCheckCode, "READY">;
      message: string;
    };

export type DatabaseTarget = Readonly<{
  database: string;
  host: string;
  port: string;
}>;

function createDatabaseClient(connectionString: string): DatabaseClient {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 3_000,
  });

  return {
    connect: async () => {
      await client.connect();
    },
    query: (statement) => client.query(statement),
    end: () => client.end(),
  };
}

function failure(code: Exclude<DatabaseCheckCode, "READY">, message: string): DatabaseCheckResult {
  return { ok: false, code, message };
}

function parseDatabaseTarget(connectionString: string | undefined): DatabaseTarget | DatabaseCheckResult {
  if (!connectionString?.trim()) {
    return failure(
      "MISSING_CONFIGURATION",
      "DATABASE_URL is missing. Set it to the Better Content development database and retry.",
    );
  }

  try {
    const url = new URL(connectionString);
    const database = decodeURIComponent(url.pathname).replace(/^\/+/, "");

    if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || !database) {
      return failure(
        "INVALID_CONFIGURATION",
        "DATABASE_URL must be a PostgreSQL connection string for a named database.",
      );
    }

    return {
      database,
      host: url.hostname.replace(/^\[|\]$/g, "").toLowerCase(),
      port: url.port || "5432",
    };
  } catch {
    return failure("INVALID_CONFIGURATION", "DATABASE_URL is not a valid PostgreSQL connection string.");
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

function isUnreachableError(error: unknown): boolean {
  const code = errorCode(error);

  if (["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(code ?? "")) {
    return true;
  }

  if (typeof error !== "object" || error === null || !("message" in error) || typeof error.message !== "string") {
    return false;
  }

  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(error.message);
}

function connectionFailure(error: unknown, target: DatabaseTarget): DatabaseCheckResult {
  const code = errorCode(error);

  if (code === "3D000") {
    return failure(
      "DATABASE_NOT_FOUND",
      "Configured PostgreSQL database \"" +
        target.database +
        "\" was not found at " +
        target.host +
        ":" +
        target.port +
        ". Check DATABASE_URL or run npm run db:up.",
    );
  }

  if (code === "28P01" || code === "28000") {
    return failure(
      "INVALID_CONFIGURATION",
      "PostgreSQL rejected the configured credentials for database \"" +
        target.database +
        "\". Check your local DATABASE_URL.",
    );
  }

  if (isUnreachableError(error)) {
    return failure(
      "UNREACHABLE",
      "Cannot reach PostgreSQL at " + target.host + ":" + target.port + ". Run npm run db:up and retry.",
    );
  }

  return failure(
    "DATABASE_ERROR",
    "Could not connect to the configured PostgreSQL database \"" +
      target.database +
      "\". Check the local database configuration and retry.",
  );
}

function localPortConfigurationFailure(
  environment: Readonly<Record<string, string | undefined>>,
  target: DatabaseTarget,
): DatabaseCheckResult | undefined {
  const configuredPort = environment.BETTER_CONTENT_DB_PORT?.trim() || "5433";

  if (!/^\d+$/.test(configuredPort) || Number(configuredPort) < 1 || Number(configuredPort) > 65535) {
    return failure("INVALID_CONFIGURATION", "BETTER_CONTENT_DB_PORT must be a valid TCP port number.");
  }

  if (["localhost", "127.0.0.1", "::1"].includes(target.host) && target.port !== configuredPort) {
    return failure(
      "INVALID_CONFIGURATION",
      "DATABASE_URL targets localhost:" +
        target.port +
        ", but Better Content development PostgreSQL uses localhost:" +
        configuredPort +
        ". Update DATABASE_URL and retry.",
    );
  }

  return undefined;
}

function schemaFailure(missingTables: readonly string[], missingMigrationHistory: boolean): DatabaseCheckResult {
  const missing = [...missingTables];

  if (missingMigrationHistory) {
    missing.push("drizzle." + migrationsTable);
  }

  return failure(
    "SCHEMA_MISSING",
    "Better Content database schema or migration history is missing (" +
      missing.join(", ") +
      "). Run npm run db:migrate and retry.",
  );
}

export async function checkDatabaseReadiness(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  clientFactory: DatabaseClientFactory = createDatabaseClient,
): Promise<DatabaseCheckResult> {
  const target = parseDatabaseTarget(environment.DATABASE_URL);

  if ("ok" in target) {
    return target;
  }

  const portConfigurationFailure = localPortConfigurationFailure(environment, target);

  if (portConfigurationFailure) {
    return portConfigurationFailure;
  }

  const client = clientFactory(environment.DATABASE_URL!);

  try {
    await client.connect();
  } catch (error) {
    return connectionFailure(error, target);
  }

  try {
    const currentDatabaseResult = await client.query("SELECT current_database()");
    const currentDatabase = String(currentDatabaseResult.rows[0]?.current_database ?? "");

    if (currentDatabase.toLowerCase() !== target.database.toLowerCase()) {
      return failure(
        "DATABASE_IDENTITY_MISMATCH",
        "DATABASE_URL requested database \"" +
          target.database +
          "\", but PostgreSQL connected to \"" +
          (currentDatabase || "an unknown database") +
          "\". Check DATABASE_URL and retry.",
      );
    }

    const tableResult = await client.query(
      [
        "SELECT table_schema, table_name",
        "FROM information_schema.tables",
        "WHERE (table_schema = 'public' AND table_name IN ('account', 'session', 'user', 'verification', 'workspaces', 'workspace_members'))",
        "   OR (table_schema = 'drizzle' AND table_name = '__drizzle_migrations')",
      ].join("\n"),
    );
    const presentTables = new Set(
      tableResult.rows.map((row) => String(row.table_schema) + "." + String(row.table_name)),
    );
    const missingTables = requiredApplicationTables.filter((table) => !presentTables.has("public." + table));
    const hasMigrationTable = presentTables.has("drizzle." + migrationsTable);

    if (missingTables.length > 0 || !hasMigrationTable) {
      return schemaFailure(missingTables, !hasMigrationTable);
    }

    const migrationResult = await client.query(
      'SELECT count(*)::int AS count FROM "drizzle"."__drizzle_migrations"',
    );
    const migrationCount = Number(migrationResult.rows[0]?.count ?? 0);

    if (!Number.isFinite(migrationCount) || migrationCount < 1) {
      return schemaFailure([], true);
    }

    return {
      ok: true,
      code: "READY",
      target,
      message:
        "Better Content database is ready at " +
        target.host +
        ":" +
        target.port +
        "/" +
        target.database +
        ".",
    };
  } catch (error) {
    return connectionFailure(error, target);
  } finally {
    await client.end().catch(() => undefined);
  }
}
