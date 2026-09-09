import { describe, expect, it, vi } from "vitest";

import type { AssetStorage } from "./asset-storage";
import { AssetWorkerPreflightError, verifyAssetWorkerDeployment } from "./asset-worker-preflight";
import type { db } from "@/db";

const environment = {
  FFPROBE_PATH: "C:/opt/ffprobe/ffprobe.exe",
  FFPROBE_EXPECTED_VERSION: "7.0.1",
  ASSET_WORKER_TEMP_DIR: "C:/tmp",
};

const database = () =>
  ({ execute: vi.fn(async () => undefined) }) as unknown as Pick<typeof db, "execute">;

function storage(): AssetStorage {
  return {
    listManagedObjects: vi.fn(async () => ({ objects: [], nextCursor: null })),
    createStagingPutCapability: vi.fn(),
    getObjectMetadata: vi.fn(),
    openStagingRead: vi.fn(),
    putStagingFromStream: vi.fn(),
    putPermanentFromStream: vi.fn(),
    openPermanentRead: vi.fn(),
    copyStagingToPermanent: vi.fn(),
    deleteStagingObject: vi.fn(),
    deletePermanentObject: vi.fn(),
    createPrivateReadCapability: vi.fn(),
  } as unknown as AssetStorage;
}

describe("asset worker deployment preflight", () => {
  it("checks ffprobe, database, private storage, and temporary writes", async () => {
    const verifyRuntime = vi.fn(async () => undefined);
    const testDatabase = database();
    const result = await verifyAssetWorkerDeployment({
      environment,
      database: testDatabase,
      storage: storage(),
      inspector: { verifyRuntime },
      tempDirectory: process.cwd(),
      minimumTempDiskBytes: 1,
    });

    expect(result).toMatchObject({ nodeMajor: 24, ffprobeVersion: "7.0.1" });
    expect(verifyRuntime).toHaveBeenCalledOnce();
    expect(testDatabase.execute).toHaveBeenCalledOnce();
  });

  it("fails safely when the exact ffprobe contract is not configured", async () => {
    await expect(
      verifyAssetWorkerDeployment({
        environment: {},
        database: database(),
        storage: storage(),
        tempDirectory: process.cwd(),
        minimumTempDiskBytes: 1,
      }),
    ).rejects.toMatchObject({
      name: "AssetWorkerPreflightError",
      failures: ["FFPROBE_PATH and FFPROBE_EXPECTED_VERSION are required."],
    } satisfies Partial<AssetWorkerPreflightError>);
  });

  it("fails safely when a dependency probe or storage access fails", async () => {
    const error = await verifyAssetWorkerDeployment({
      environment,
      database: database(),
      storage: {
        ...storage(),
        listManagedObjects: vi.fn(async () => {
          throw new Error("storage unavailable");
        }),
      },
      inspector: {
        verifyRuntime: vi.fn(async () => {
          throw new Error("wrong version");
        }),
      },
      tempDirectory: process.cwd(),
      minimumTempDiskBytes: 1,
    }).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(AssetWorkerPreflightError);
    expect((error as AssetWorkerPreflightError).failures).toEqual([
      "The configured ffprobe executable is unavailable or has the wrong version.",
      "Private managed storage is unavailable.",
    ]);
  });
});
