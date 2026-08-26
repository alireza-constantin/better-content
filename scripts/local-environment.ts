import { existsSync } from "node:fs";

export type LocalEnvironmentResult =
  | { ok: true }
  | { ok: false; message: string };

export function loadLocalEnvironment(): LocalEnvironmentResult {
  if (typeof process.loadEnvFile !== "function") {
    return { ok: true };
  }

  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) {
      continue;
    }

    try {
      process.loadEnvFile(file);
    } catch {
      return {
        ok: false,
        message: "Could not read " + file + ". Fix its format and retry.",
      };
    }
  }

  return { ok: true };
}
