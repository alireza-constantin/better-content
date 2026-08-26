import { z } from "zod";

const e2eDatabaseEnvironmentSchema = z.object({
  E2E_DATABASE_URL: z.url(),
  DATABASE_URL: z.url(),
});

type EnvironmentValues = Readonly<Record<string, string | undefined>>;

function getDatabaseIdentity(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname).replace(/^\/+/, "").toLowerCase();
  const port = url.port || "5432";

  return `${url.protocol}//${url.hostname.toLowerCase()}:${port}/${databaseName}`;
}

/**
 * E2E starts the application with this URL as DATABASE_URL, so validate it
 * before any cleanup runs. Keeping the normal development URL separate makes
 * accidental destructive test setup fail closed.
 */
export function getE2eDatabaseUrl(environment: EnvironmentValues): string {
  const { DATABASE_URL, E2E_DATABASE_URL } = e2eDatabaseEnvironmentSchema.parse(environment);
  const databaseName = decodeURIComponent(new URL(E2E_DATABASE_URL).pathname).replace(/^\/+/, "");

  if (getDatabaseIdentity(DATABASE_URL) === getDatabaseIdentity(E2E_DATABASE_URL)) {
    throw new Error("E2E_DATABASE_URL must not be the same as DATABASE_URL.");
  }

  if (!databaseName.toLowerCase().endsWith("_test")) {
    throw new Error("E2E_DATABASE_URL must identify a dedicated database ending in _test.");
  }

  return E2E_DATABASE_URL;
}
