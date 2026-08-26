import { describe, expect, it } from "vitest";

import { getTestDatabaseUrl } from "./test-environment";

const testDatabaseUrl = "postgresql://postgres:postgres@localhost:5433/better_content_test";

describe("test database configuration", () => {
  it("accepts a dedicated test database that differs from production", () => {
    expect(
      getTestDatabaseUrl({
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/better_content",
        TEST_DATABASE_URL: testDatabaseUrl,
      }),
    ).toBe(testDatabaseUrl);
  });

  it("rejects a test database URL that matches production", () => {
    expect(() =>
      getTestDatabaseUrl({
        DATABASE_URL: testDatabaseUrl,
        TEST_DATABASE_URL: testDatabaseUrl,
      }),
    ).toThrow("must not be the same");
  });

  it("rejects an equivalent production URL with different URL formatting", () => {
    expect(() =>
      getTestDatabaseUrl({
        DATABASE_URL: "postgresql://postgres:postgres@LOCALHOST:5433/better_content_test?application_name=app",
        TEST_DATABASE_URL: testDatabaseUrl,
      }),
    ).toThrow("must not be the same");
  });

  it("rejects a database that does not use the dedicated _test suffix", () => {
    expect(() =>
      getTestDatabaseUrl({
        TEST_DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/contest",
      }),
    ).toThrow("ending in _test");
  });
});
