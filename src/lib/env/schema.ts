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

const openAIEnvironmentSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  AI_SAFETY_IDENTIFIER_SECRET: z.string().min(32),
  OPENAI_BASE_URL: z
    .url()
    .refine((value) => {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      const isOfficialOpenAiHost = hostname === "api.openai.com";
      const isLoopbackHost =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "[::1]" ||
        hostname === "::1";

      return (
        (isOfficialOpenAiHost
          ? url.protocol === "https:"
          : url.protocol === "http:" || url.protocol === "https:") &&
        url.username === "" &&
        url.password === "" &&
        url.search === "" &&
        url.hash === "" &&
        (isOfficialOpenAiHost || isLoopbackHost) &&
        (url.pathname === "/v1" || url.pathname === "/v1/")
      );
    }, "Expected the official OpenAI API or a loopback /v1 base URL without credentials.")
    .optional(),
});

const serverOnlyEnvironmentKeys = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "OPENAI_API_KEY",
  "AI_SAFETY_IDENTIFIER_SECRET",
  "OPENAI_BASE_URL",
] as const;

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export type OpenAIEnvironment = z.infer<typeof openAIEnvironmentSchema>;

type EnvironmentValues = Readonly<Record<string, string | undefined>>;

export function parseServerEnvironment(environment: EnvironmentValues): ServerEnvironment {
  for (const key of serverOnlyEnvironmentKeys) {
    if (environment[`NEXT_PUBLIC_${key}`]) {
      throw new Error(`${key} must not be exposed through NEXT_PUBLIC_ environment variables.`);
    }
  }

  return serverEnvironmentSchema.parse(environment);
}

export function parseOpenAIEnvironment(environment: EnvironmentValues): OpenAIEnvironment {
  for (const key of ["OPENAI_API_KEY", "AI_SAFETY_IDENTIFIER_SECRET"] as const) {
    if (environment[`NEXT_PUBLIC_${key}`]) {
      throw new Error(`${key} must not be exposed through NEXT_PUBLIC_ environment variables.`);
    }
  }

  return openAIEnvironmentSchema.parse(environment);
}
