import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { resetE2eDatabase } from "./e2e-database";

const databaseUrl = await resetE2eDatabase(process.env);
const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const serverEnvironment = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  // E2E uses sanitized database fixtures and must never be able to reach the
  // real provider, even when the invoking shell has local AvalAI credentials.
  // Empty values intentionally fail the provider configuration boundary if a
  // test exercises generation/retry; they prevent Next from reloading local
  // credentials and keep E2E deterministic without a provider request.
  AVALAI_API_KEY: "",
  AI_SAFETY_IDENTIFIER_SECRET: "",
  BETTER_CONTENT_E2E: "1",
  BETTER_AUTH_SECRET: "e2e-only-better-auth-secret-that-is-long-enough",
  BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
  NEXT_DIST_DIR: ".next-e2e",
};

const nextCli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const generatedFiles = ["next-env.d.ts", "tsconfig.json"] as const;
const originalGeneratedFiles = new Map(generatedFiles.map((file) => [file, readFileSync(file)]));
let restoredGeneratedFiles = false;

function restoreGeneratedFiles(): void {
  if (restoredGeneratedFiles) {
    return;
  }

  for (const [file, content] of originalGeneratedFiles) {
    writeFileSync(file, content);
  }

  restoredGeneratedFiles = true;
}

process.once("exit", restoreGeneratedFiles);

function runNext(arguments_: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextCli, ...arguments_], {
      env: serverEnvironment,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Next.js ${arguments_[0]} exited with code ${code ?? "unknown"}.`));
      }
    });
  });
}

try {
  await runNext(["build"]);

  const child = spawn(
    process.execPath,
    [nextCli, "start", "--hostname", "127.0.0.1", "--port", port],
    {
      env: serverEnvironment,
      stdio: "inherit",
    },
  );

  child.on("error", (error) => {
    restoreGeneratedFiles();
    throw error;
  });

  child.on("exit", (code, signal) => {
    restoreGeneratedFiles();
    process.exitCode = code ?? (signal ? 1 : 0);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => child.kill(signal));
  }
} catch (error) {
  restoreGeneratedFiles();
  throw error;
}
