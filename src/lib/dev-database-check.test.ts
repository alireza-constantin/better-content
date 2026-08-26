import { describe, expect, it, vi } from "vitest";

import {
  checkDatabaseReadiness,
  type DatabaseClient,
  type DatabaseClientFactory,
} from "./dev-database-check";

const developmentEnvironment = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/better_content",
};

function clientFactory(query: DatabaseClient["query"]): DatabaseClientFactory {
  return () => ({
    connect: vi.fn(async () => undefined),
    query,
    end: vi.fn(async () => undefined),
  });
}

describe("development database readiness", () => {
  it("reports missing database configuration without exposing credentials", async () => {
    const result = await checkDatabaseReadiness({});

    expect(result).toMatchObject({ code: "MISSING_CONFIGURATION" });
    expect(result.message).toContain("DATABASE_URL");
    expect(result.message).not.toContain("postgres:postgres");
  });

  it("reports an unreachable PostgreSQL server without exposing the connection URL", async () => {
    const error = Object.assign(new Error("connect ECONNREFUSED postgres:postgres@localhost"), {
      code: "ECONNREFUSED",
    });
    const factory = () => ({
      connect: vi.fn(async () => {
        throw error;
      }),
      query: vi.fn(),
      end: vi.fn(async () => undefined),
    });

    const result = await checkDatabaseReadiness(developmentEnvironment, factory);

    expect(result).toMatchObject({ code: "UNREACHABLE" });
    expect(result.message).toContain("npm run db:up");
    expect(result.message).not.toContain("postgres:postgres");
  });

  it("reports when the configured database does not exist", async () => {
    const error = Object.assign(new Error('database "better_content" does not exist'), { code: "3D000" });
    const factory = () => ({
      connect: vi.fn(async () => {
        throw error;
      }),
      query: vi.fn(),
      end: vi.fn(async () => undefined),
    });

    const result = await checkDatabaseReadiness(developmentEnvironment, factory);

    expect(result).toMatchObject({ code: "DATABASE_NOT_FOUND" });
    expect(result.message).toContain("better_content");
    expect(result.message).toContain("DATABASE_URL");
  });

  it("reports when PostgreSQL connects to a different database than requested", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("current_database")) {
        return { rows: [{ current_database: "postgres" }] };
      }

      return { rows: [] };
    });

    const result = await checkDatabaseReadiness(developmentEnvironment, clientFactory(query));

    expect(result).toMatchObject({ code: "DATABASE_IDENTITY_MISMATCH" });
    expect(result.message).toContain("postgres");
    expect(result.message).not.toContain("postgres:postgres");
  });

  it("reports when the local port override and DATABASE_URL disagree", async () => {
    const result = await checkDatabaseReadiness({
      ...developmentEnvironment,
      BETTER_CONTENT_DB_PORT: "5544",
    });

    expect(result).toMatchObject({ code: "INVALID_CONFIGURATION" });
    expect(result.message).toContain("5544");
    expect(result.message).toContain("DATABASE_URL");
  });

  it("reports missing Better Content schema and migration history", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("current_database")) {
        return { rows: [{ current_database: "better_content" }] };
      }

      return { rows: [{ table_schema: "public", table_name: "user" }] };
    });

    const result = await checkDatabaseReadiness(developmentEnvironment, clientFactory(query));

    expect(result).toMatchObject({ code: "SCHEMA_MISSING" });
    expect(result.message).toContain("npm run db:migrate");
  });

  it("accepts a migrated Better Content database", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes("current_database")) {
        return { rows: [{ current_database: "better_content" }] };
      }

      if (statement.includes("information_schema")) {
        return {
          rows: [
            { table_schema: "public", table_name: "account" },
            { table_schema: "public", table_name: "session" },
            { table_schema: "public", table_name: "user" },
            { table_schema: "public", table_name: "verification" },
            { table_schema: "public", table_name: "workspaces" },
            { table_schema: "public", table_name: "workspace_members" },
            { table_schema: "drizzle", table_name: "__drizzle_migrations" },
          ],
        };
      }

      return { rows: [{ count: 1 }] };
    });

    const result = await checkDatabaseReadiness(developmentEnvironment, clientFactory(query));

    expect(result).toMatchObject({ ok: true, code: "READY" });
  });
});
