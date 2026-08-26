import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { checkDatabaseReadiness } from "../src/lib/dev-database-check";
import { loadLocalEnvironment } from "./local-environment";

function startNext(): Promise<number> {
  const nextProcess = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", ...process.argv.slice(2)], {
    env: process.env,
    stdio: "inherit",
  });

  return new Promise((resolve) => {
    nextProcess.once("error", () => {
      console.error("Could not start Next.js development server.");
      resolve(1);
    });
    nextProcess.once("exit", (code, signal) => {
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

async function main(): Promise<number> {
  const environment = loadLocalEnvironment();

  if (!environment.ok) {
    console.error("Better Content development preflight failed: " + environment.message);
    return 1;
  }

  const result = await checkDatabaseReadiness();

  if (!result.ok) {
    console.error("Better Content development database is unavailable. " + result.message);
    return 1;
  }

  return startNext();
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch(() => {
    console.error(
      "Better Content development preflight failed. Run npm run db:up and npm run db:migrate, then retry.",
    );
    process.exitCode = 1;
  });
