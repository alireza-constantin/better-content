import { z } from "zod";

const postgresUrl = z
  .url()
  .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
    message: "Expected a PostgreSQL connection URL.",
  });

const applicationOrigin = z
  .url()
  .refine((value) => {
    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  }, "Expected an HTTP(S) application origin without a path, query, fragment, or credentials.")
  .transform((value) => new URL(value).origin);

const serverEnvironmentSchema = z.object({
  DATABASE_URL: postgresUrl,
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: applicationOrigin,
});

const avalAIEnvironmentSchema = z.object({
  AVALAI_API_KEY: z.string().min(1),
  AI_SAFETY_IDENTIFIER_SECRET: z.string().min(32),
});

const serverOnlyEnvironmentKeys = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "AVALAI_API_KEY",
  "AI_SAFETY_IDENTIFIER_SECRET",
] as const;

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export type AvalAIEnvironment = z.infer<typeof avalAIEnvironmentSchema>;

type EnvironmentValues = Readonly<Record<string, string | undefined>>;

export function parseServerEnvironment(environment: EnvironmentValues): ServerEnvironment {
  for (const key of serverOnlyEnvironmentKeys) {
    if (environment[`NEXT_PUBLIC_${key}`]) {
      throw new Error(`${key} must not be exposed through NEXT_PUBLIC_ environment variables.`);
    }
  }

  return serverEnvironmentSchema.parse(environment);
}

export function parseAvalAIEnvironment(environment: EnvironmentValues): AvalAIEnvironment {
  for (const key of ["AI_BASE_URL", "OPENAI_BASE_URL"] as const) {
    if (environment[key]) {
      throw new Error(`${key} is not supported; AvalAI's production origin is fixed.`);
    }
  }

  for (const key of ["AVALAI_API_KEY", "AI_SAFETY_IDENTIFIER_SECRET"] as const) {
    if (environment[`NEXT_PUBLIC_${key}`]) {
      throw new Error(`${key} must not be exposed through NEXT_PUBLIC_ environment variables.`);
    }
  }

  return avalAIEnvironmentSchema.parse(environment);
}
