import { mkdtemp, rm, statfs, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpsRequest } from "node:https";

import sharp from "sharp";
import { sql } from "drizzle-orm";

import type { db } from "@/db";
import type { AssetStorage } from "./asset-storage";
import { FfprobeMediaInspector } from "./ffprobe-media-inspector";

const minimumNodeMajor = 24;
const maximumNodeMajor = 24;
const defaultMinimumTempDiskBytes = 1_024 * 1_024 * 1_024;

type Environment = Readonly<Record<string, string | undefined>>;
type PreflightDatabase = Pick<typeof db, "execute">;

export type AssetWorkerPreflightDependencies = Readonly<{
  environment?: Environment;
  database: PreflightDatabase;
  storage: AssetStorage;
  inspector?: Pick<FfprobeMediaInspector, "verifyRuntime">;
  tempDirectory?: string;
  minimumTempDiskBytes?: number;
}>;

export class AssetWorkerPreflightError extends Error {
  constructor(readonly failures: readonly string[]) {
    super(`Asset worker preflight failed: ${failures.join("; ")}`);
    this.name = "AssetWorkerPreflightError";
  }
}

/**
 * Deployment gate for the dedicated media runner. It performs only bounded,
 * non-destructive checks: no object is written and no creator data is read.
 */
export async function verifyAssetWorkerDeployment(
  dependencies: AssetWorkerPreflightDependencies,
): Promise<Readonly<{ nodeMajor: number; ffprobeVersion: string; tempDirectory: string }>> {
  const environment = dependencies.environment ?? process.env;
  const failures: string[] = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (
    !Number.isSafeInteger(nodeMajor) ||
    nodeMajor < minimumNodeMajor ||
    nodeMajor > maximumNodeMajor
  )
    failures.push("Node.js 24 is required.");

  if (
    typeof sharp !== "function" ||
    !sharp.versions?.sharp ||
    !sharp.format.jpeg?.input?.file ||
    !sharp.format.png?.input?.file ||
    !sharp.format.webp?.input?.file
  )
    failures.push("The direct Sharp runtime does not provide the approved image formats.");

  const ffprobePath = environment.FFPROBE_PATH;
  const expectedVersion = environment.FFPROBE_EXPECTED_VERSION;
  let ffprobeVersion = expectedVersion ?? "";
  if (!ffprobePath || !expectedVersion) {
    failures.push("FFPROBE_PATH and FFPROBE_EXPECTED_VERSION are required.");
  } else {
    try {
      await (
        dependencies.inspector ??
        new FfprobeMediaInspector({
          executablePath: ffprobePath,
          expectedVersion,
        })
      ).verifyRuntime();
      ffprobeVersion = expectedVersion;
    } catch {
      failures.push("The configured ffprobe executable is unavailable or has the wrong version.");
    }
  }

  const tempDirectory = dependencies.tempDirectory ?? environment.ASSET_WORKER_TEMP_DIR ?? tmpdir();
  try {
    const filesystem = await statfs(tempDirectory);
    const freeBytes = filesystem.bavail * filesystem.bsize;
    const minimumTempDiskBytes = dependencies.minimumTempDiskBytes ?? defaultMinimumTempDiskBytes;
    if (!Number.isSafeInteger(freeBytes) || freeBytes < minimumTempDiskBytes)
      failures.push("The worker temporary disk does not have the required free capacity.");
    else await verifyTemporaryWrite(tempDirectory);
  } catch {
    failures.push("The worker temporary directory is unavailable or not writable.");
  }

  if (typeof httpsRequest !== "function") failures.push("Outbound HTTPS is unavailable.");

  try {
    await dependencies.database.execute(sql`select 1`);
  } catch {
    failures.push("PostgreSQL is unavailable.");
  }

  try {
    await dependencies.storage.listManagedObjects({ namespace: "permanent", limit: 1 });
  } catch {
    failures.push("Private managed storage is unavailable.");
  }

  if (failures.length) throw new AssetWorkerPreflightError(failures);
  return { nodeMajor, ffprobeVersion, tempDirectory };
}

async function verifyTemporaryWrite(directory: string): Promise<void> {
  const probeDirectory = await mkdtemp(join(directory, "better-content-asset-preflight-"));
  try {
    await writeFile(join(probeDirectory, "probe"), "ok", { encoding: "utf8", mode: 0o600 });
  } finally {
    await rm(probeDirectory, { recursive: true, force: true });
  }
}
