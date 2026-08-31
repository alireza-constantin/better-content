import { z } from "zod";

const testDatabaseEnvironmentSchema = z.object({
  TEST_DATABASE_URL: z.url(),
  DATABASE_URL: z.url().optional(),
});

type EnvironmentValues = Readonly<Record<string, string | undefined>>;

function getDatabaseIdentity(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname).replace(/^\/+/, "").toLowerCase();
  const port = url.port || "5432";

  return `${url.protocol}//${url.hostname.toLowerCase()}:${port}/${databaseName}`;
}

export function getTestDatabaseUrl(environment: EnvironmentValues): string {
  const { DATABASE_URL, TEST_DATABASE_URL } = testDatabaseEnvironmentSchema.parse(environment);
  const databaseName = decodeURIComponent(new URL(TEST_DATABASE_URL).pathname).replace(/^\/+/, "");

  if (!databaseName.toLowerCase().endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL must identify a dedicated database ending in _test.");
  }

  if (
    DATABASE_URL &&
    getDatabaseIdentity(DATABASE_URL) === getDatabaseIdentity(TEST_DATABASE_URL)
  ) {
    throw new Error("TEST_DATABASE_URL must not be the same as DATABASE_URL.");
  }

  return TEST_DATABASE_URL;
}
