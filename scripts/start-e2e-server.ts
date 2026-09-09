import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";

import { resetE2eDatabase } from "./e2e-database";

const databaseUrl = await resetE2eDatabase(process.env);
const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const openAiMock = await startOpenAiMockServer();
const assetStorageMock = await startAssetStorageMockServer();
const serverEnvironment = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  // E2E uses sanitized database fixtures and must never be able to reach the
  // real provider, even when the invoking shell has local AvalAI credentials.
  // Empty values intentionally fail the provider configuration boundary if a
  // test exercises generation/retry; they prevent Next from reloading local
  // credentials and keep E2E deterministic without a provider request.
  AVALAI_API_KEY: "",
  BETTER_CONTENT_E2E: "1",
  BETTER_AUTH_SECRET: "e2e-only-better-auth-secret-that-is-long-enough",
  BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
  NEXT_DIST_DIR: ".next-e2e",
  OPENAI_API_KEY: "e2e-local-mock-key",
  AI_SAFETY_IDENTIFIER_SECRET: "e2e-only-safety-identifier-secret-that-is-long-enough",
  OPENAI_BASE_URL: openAiMock.baseUrl,
  ASSET_STORAGE_DRIVER: "s3",
  ASSET_STORAGE_VERSIONING: "disabled",
  ASSET_S3_ENDPOINT: assetStorageMock.baseUrl,
  ASSET_S3_REGION: "e2e",
  ASSET_S3_BUCKET: "e2e-assets",
  ASSET_S3_ACCESS_KEY_ID: "e2e-access-key",
  ASSET_S3_SECRET_ACCESS_KEY: "e2e-secret-key",
  ASSET_S3_FORCE_PATH_STYLE: "true",
};

const nextCli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const generatedFiles = ["next-env.d.ts", "tsconfig.json"] as const;
const originalGeneratedFiles = new Map(generatedFiles.map((file) => [file, readFileSync(file)]));
let restoredGeneratedFiles = false;
let closedOpenAiMock = false;
let closedAssetStorageMock = false;

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

async function startAssetStorageMockServer(): Promise<
  Readonly<{ server: Server; baseUrl: string }>
> {
  const bucket = "e2e-assets";
  const objects = new Map<string, Readonly<{ bytes: Buffer; lastModified: Date }>>();
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const key = decodePathKey(requestUrl.pathname, bucket);
    for (const [name, value] of Object.entries({
      "access-control-allow-origin": `http://127.0.0.1:${port}`,
      "access-control-allow-methods": "PUT, GET, HEAD, DELETE, OPTIONS",
      "access-control-allow-headers": "Content-Type, Content-Length, Range, X-Amz-*",
    }))
      response.setHeader(name, value);
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (!key) {
      response.writeHead(404).end();
      return;
    }
    const authorized =
      request.headers.authorization || requestUrl.searchParams.has("X-Amz-Signature");
    if (!authorized) {
      response.writeHead(403).end();
      return;
    }
    if (request.method === "HEAD") {
      const object = objects.get(key);
      if (!object) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-length": object.bytes.byteLength }).end();
      return;
    }
    if (request.method === "GET" && requestUrl.searchParams.get("list-type") === "2") {
      const prefix = requestUrl.searchParams.get("prefix") ?? "";
      const continuation = requestUrl.searchParams.get("continuation-token");
      const limit = Number(requestUrl.searchParams.get("max-keys") ?? "1000");
      const keys = [...objects.keys()]
        .filter(
          (candidate) =>
            candidate.startsWith(prefix) && (!continuation || candidate > continuation),
        )
        .sort();
      const page = keys.slice(0, limit);
      const truncated = keys.length > page.length;
      response
        .writeHead(200, { "content-type": "application/xml" })
        .end(
          `<ListBucketResult><Name>${bucket}</Name><Prefix>${xml(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><MaxKeys>${limit}</MaxKeys><IsTruncated>${truncated}</IsTruncated>${page
            .map(
              (candidate) =>
                `<Contents><Key>${xml(candidate)}</Key><LastModified>${objects.get(candidate)!.lastModified.toISOString()}</LastModified><ETag>"e2e"</ETag><Size>${objects.get(candidate)!.bytes.byteLength}</Size><StorageClass>STANDARD</StorageClass></Contents>`,
            )
            .join(
              "",
            )}${truncated ? `<NextContinuationToken>${xml(page.at(-1)!)}</NextContinuationToken>` : ""}</ListBucketResult>`,
        );
      return;
    }
    if (request.method === "GET") {
      const object = objects.get(key);
      if (!object) {
        response.writeHead(404).end();
        return;
      }
      let bytes = object.bytes;
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const headers: Record<string, string | number> = {
        "content-length": bytes.byteLength,
        "content-type":
          requestUrl.searchParams.get("response-content-type") ?? "application/octet-stream",
        "cache-control":
          requestUrl.searchParams.get("response-cache-control") ?? "private, no-store",
        "content-disposition":
          requestUrl.searchParams.get("response-content-disposition") ?? "inline",
      };
      if (range) {
        const start = Number(range[1]);
        const end = range[2] ? Number(range[2]) : bytes.byteLength - 1;
        if (start >= bytes.byteLength || end < start) {
          response.writeHead(416).end();
          return;
        }
        bytes = bytes.subarray(start, Math.min(end + 1, bytes.byteLength));
        headers["content-length"] = bytes.byteLength;
        headers["content-range"] =
          `bytes ${start}-${start + bytes.byteLength - 1}/${object.bytes.byteLength}`;
        response.writeHead(206, headers).end(bytes);
      } else response.writeHead(200, headers).end(bytes);
      return;
    }
    if (request.method === "DELETE") {
      objects.delete(key);
      response.writeHead(204).end();
      return;
    }
    if (request.method === "PUT") {
      const copySource = request.headers["x-amz-copy-source"];
      if (copySource) {
        const sourceKey = decodeURIComponent(String(copySource)).replace(/^\/?[^/]+\//, "");
        const source = objects.get(sourceKey);
        if (!source) {
          response.writeHead(404).end();
          return;
        }
        if (!objects.has(key))
          objects.set(key, { bytes: Buffer.from(source.bytes), lastModified: new Date() });
        response.writeHead(200).end();
        return;
      }
      if (request.headers["if-none-match"] === "*" && objects.has(key)) {
        response.writeHead(412).end();
        return;
      }
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        objects.set(key, { bytes: Buffer.concat(chunks), lastModified: new Date() });
        response.writeHead(200).end();
      });
      return;
    }
    response.writeHead(405).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3101, "127.0.0.1", resolve);
  });
  return { server, baseUrl: "http://127.0.0.1:3101" };
}

function decodePathKey(pathname: string, bucket: string): string | null {
  const prefix = `/${bucket}/`;
  if (!pathname.startsWith(prefix)) return null;
  try {
    return pathname
      .slice(prefix.length)
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join("/");
  } catch {
    return null;
  }
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

function closeAssetStorageMock(): Promise<void> {
  if (closedAssetStorageMock) return Promise.resolve();
  closedAssetStorageMock = true;
  assetStorageMock.server.closeAllConnections();
  return new Promise((resolve) => assetStorageMock.server.close(() => resolve()));
}

process.once("exit", restoreGeneratedFiles);
process.once("exit", () => {
  if (!closedOpenAiMock) {
    openAiMock.server.close();
  }
});
process.once("exit", () => {
  if (!closedAssetStorageMock) assetStorageMock.server.close();
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
    void closeAssetStorageMock();
    process.exitCode = code ?? (signal ? 1 : 0);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void closeOpenAiMock().finally(() => child.kill(signal));
      void closeAssetStorageMock();
    });
  }
} catch (error) {
  restoreGeneratedFiles();
  await closeOpenAiMock();
  await closeAssetStorageMock();
  throw error;
}
