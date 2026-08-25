import { z } from "zod";

const postgresUrl = z.url().refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
  message: "Expected a PostgreSQL connection URL.",
});

const serverEnvironmentSchema = z.object({
  DATABASE_URL: postgresUrl,
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
});

const serverOnlyEnvironmentKeys = ["DATABASE_URL", "BETTER_AUTH_SECRET"] as const;

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

type EnvironmentValues = Readonly<Record<string, string | undefined>>;

export function parseServerEnvironment(environment: EnvironmentValues): ServerEnvironment {
  for (const key of serverOnlyEnvironmentKeys) {
    if (environment[`NEXT_PUBLIC_${key}`]) {
      throw new Error(`${key} must not be exposed through NEXT_PUBLIC_ environment variables.`);
    }
  }

  return serverEnvironmentSchema.parse(environment);
}
