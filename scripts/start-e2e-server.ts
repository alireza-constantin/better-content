import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";

import { resetE2eDatabase } from "./e2e-database";

const databaseUrl = await resetE2eDatabase(process.env);
const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const openAiMock = await startOpenAiMockServer();
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
  OPENAI_API_KEY: "e2e-local-mock-key",
  AI_SAFETY_IDENTIFIER_SECRET: "e2e-only-safety-identifier-secret-that-is-long-enough",
  OPENAI_BASE_URL: openAiMock.baseUrl,
};

const nextCli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const generatedFiles = ["next-env.d.ts", "tsconfig.json"] as const;
const originalGeneratedFiles = new Map(generatedFiles.map((file) => [file, readFileSync(file)]));
let restoredGeneratedFiles = false;
let closedOpenAiMock = false;

async function startOpenAiMockServer(): Promise<Readonly<{ server: Server; baseUrl: string }>> {
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/responses") {
      response.writeHead(404).end();
      return;
    }

    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        const parsed = JSON.parse(body) as { model?: unknown; store?: unknown };

        if (parsed.model !== "gpt-5.6-terra" || parsed.store !== false) {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: { message: "Unexpected mock request." } }));
          return;
        }

        if (body.includes("E2E provider failure")) {
          response.writeHead(503, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: { message: "E2E provider failure." } }));
          return;
        }

        const ideas = Array.from({ length: 20 }, (_, index) => ({
          title: "E2E idea " + (index + 1),
          description: "A deterministic end-to-end idea description " + (index + 1) + ".",
          category: "E2E",
        }));
        const sendSuccess = () => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              status: "completed",
              output_text: JSON.stringify({ schemaVersion: 1, ideas }),
              incomplete_details: null,
              usage: { input_tokens: 120, output_tokens: 240, total_tokens: 360 },
            }),
          );
        };

        if (body.includes("E2E provider delay")) {
          setTimeout(sendSuccess, 1_200);
        } else {
          sendSuccess();
        }
      } catch {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "Malformed mock request." } }));
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    server.close();
    throw new Error("The local OpenAI mock did not bind to a TCP port.");
  }

  return { server, baseUrl: "http://127.0.0.1:" + address.port + "/v1" };
}

function restoreGeneratedFiles(): void {
  if (restoredGeneratedFiles) {
    return;
  }

  for (const [file, content] of originalGeneratedFiles) {
    writeFileSync(file, content);
  }

  restoredGeneratedFiles = true;
}

function closeOpenAiMock(): Promise<void> {
  if (closedOpenAiMock) {
    return Promise.resolve();
  }

  closedOpenAiMock = true;
  openAiMock.server.closeAllConnections();

  return new Promise((resolve) => {
    openAiMock.server.close(() => resolve());
  });
}

process.once("exit", restoreGeneratedFiles);
process.once("exit", () => {
  if (!closedOpenAiMock) {
    openAiMock.server.close();
  }
});

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
    void closeOpenAiMock();
    process.exitCode = code ?? (signal ? 1 : 0);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void closeOpenAiMock().finally(() => child.kill(signal));
    });
  }
} catch (error) {
  restoreGeneratedFiles();
  await closeOpenAiMock();
  throw error;
}
