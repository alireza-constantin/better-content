import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FakeAssetStorage } from "./fake-asset-storage";
import { FilesystemAssetStorage } from "./filesystem-asset-storage";
import {
  assertPermanentStorageKey,
  assertStagingStorageKey,
  createPermanentStorageKey,
  createStagingStorageKey,
} from "./storage-keys";

const bytes = Buffer.from("private-media");

async function exerciseStorage(
  storage: FakeAssetStorage | FilesystemAssetStorage,
  staging = createStagingStorageKey(),
  permanent = createPermanentStorageKey(),
) {
  if (storage instanceof FakeAssetStorage) storage.putStagingObject(staging, bytes);
  else await storage.putStagingObject(staging, bytes);
  expect(await storage.getObjectMetadata(staging)).toEqual({ sizeBytes: bytes.byteLength });
  await storage.copyStagingToPermanent({ source: staging, destination: permanent });
  const chunks: Buffer[] = [];
  for await (const chunk of await storage.openPermanentRead(permanent))
    chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(bytes);
  expect(
    (await storage.createPrivateReadCapability(permanent, new Date("2026-09-07T00:01:00Z"))).token,
  ).not.toContain(permanent);
  await storage.deletePermanentObject(permanent);
  await storage.deletePermanentObject(permanent);
  expect(await storage.getObjectMetadata(permanent)).toBeNull();
}

describe("AssetStorage adapters", () => {
  it("keeps fake staging and permanent lifecycle deterministic and injectable", async () => {
    const storage = new FakeAssetStorage();
    await exerciseStorage(storage);
    storage.failNext("copy");
    await expect(
      storage.copyStagingToPermanent({
        source: createStagingStorageKey(),
        destination: createPermanentStorageKey(),
      }),
    ).rejects.toMatchObject({ kind: "UNAVAILABLE" });
  });

  it("keeps filesystem development media private and deletes absent objects idempotently", async () => {
    const root = await mkdtemp(join(tmpdir(), "better-content-assets-"));
    try {
      await exerciseStorage(new FilesystemAssetStorage(root));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects traversal and namespace confusion before adapters resolve paths", () => {
    expect(() => assertStagingStorageKey("staging/../secret")).toThrow();
    expect(() => assertPermanentStorageKey(createStagingStorageKey())).toThrow();
    expect(() => assertStagingStorageKey(createPermanentStorageKey())).toThrow();
  });
});
