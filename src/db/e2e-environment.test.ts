import { describe, expect, it } from "vitest";

import { getE2eDatabaseUrl } from "./e2e-environment";

describe("E2E database environment", () => {
  const developmentDatabaseUrl = "postgresql://postgres:postgres@localhost:5433/better_content";
  const e2eDatabaseUrl = "postgresql://postgres:postgres@localhost:5433/better_content_e2e_test";

  it("accepts a dedicated _test database that differs from development", () => {
    expect(
      getE2eDatabaseUrl({
        DATABASE_URL: developmentDatabaseUrl,
        E2E_DATABASE_URL: e2eDatabaseUrl,
      }),
    ).toBe(e2eDatabaseUrl);
  });

  it("rejects an E2E database without the dedicated _test suffix", () => {
    expect(() =>
      getE2eDatabaseUrl({
        DATABASE_URL: developmentDatabaseUrl,
        E2E_DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/better_content_e2e",
      }),
    ).toThrow("E2E_DATABASE_URL must identify a dedicated database ending in _test.");
  });

  it("rejects an E2E database that is the same database as development", () => {
    expect(() =>
      getE2eDatabaseUrl({
        DATABASE_URL: developmentDatabaseUrl,
        E2E_DATABASE_URL: developmentDatabaseUrl,
      }),
    ).toThrow("E2E_DATABASE_URL must not be the same as DATABASE_URL.");
  });
});
