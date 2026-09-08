import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";

import { FakeAssetStorage } from "./fake-asset-storage";
import { FilesystemAssetStorage } from "./filesystem-asset-storage";
import {
  S3CompatibleAssetStorage,
  type S3CompatiblePrivateObjectClient,
} from "./s3-compatible-asset-storage";
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
  const putCapability = await storage.createStagingPutCapability(
    staging,
    new Date("2026-09-07T00:01:00Z"),
    bytes.byteLength,
  );
  expect(putCapability).toMatchObject({ key: staging, contentLength: bytes.byteLength });
  expect(await storage.getObjectMetadata(staging)).toEqual({ sizeBytes: bytes.byteLength });
  await storage.copyStagingToPermanent({ source: staging, destination: permanent });
  const chunks: Buffer[] = [];
  for await (const chunk of await storage.openPermanentRead(permanent))
    chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(bytes);
  expect(
    (
      await storage.createPrivateReadCapability(permanent, new Date("2026-09-07T00:01:00Z"), {
        contentType: "image/jpeg",
        contentDisposition: "inline",
        rangeAllowed: false,
      })
    ).url,
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

  it("keeps the S3-compatible adapter provider-neutral over a deterministic client", async () => {
    const objects = new Map<string, Buffer>();
    let privateRead: { key: string; rangeAllowed: boolean } | undefined;
    const client: S3CompatiblePrivateObjectClient = {
      issueStagingPut: async (key, _expiresAt, contentLength) => ({
        url: `https://storage.test/${key}?length=${contentLength}`,
      }),
      head: async (key) => {
        const value = objects.get(key);
        return value ? { sizeBytes: value.byteLength } : null;
      },
      get: async (key) => {
        const value = objects.get(key);
        return value ? Readable.from(value) : null;
      },
      putStaging: async (key, source) => {
        const chunks: Buffer[] = [];
        for await (const chunk of source) chunks.push(Buffer.from(chunk));
        objects.set(key, Buffer.concat(chunks));
      },
      putIfAbsent: async (key, source) => {
        if (objects.has(key)) return;
        const chunks: Buffer[] = [];
        for await (const chunk of source) chunks.push(Buffer.from(chunk));
        objects.set(key, Buffer.concat(chunks));
      },
      copyIfAbsent: async (source, destination) => {
        const value = objects.get(source);
        if (!value) throw new Error("missing source");
        if (!objects.has(destination)) objects.set(destination, Buffer.from(value));
      },
      delete: async (key) => {
        objects.delete(key);
      },
      issuePrivateRead: async (key, _expiresAt, options) => {
        privateRead = { key, rangeAllowed: options.rangeAllowed };
        return { url: `https://storage.test/private/${key}` };
      },
    };
    const storage = new S3CompatibleAssetStorage(client);
    const staging = createStagingStorageKey();
    const permanent = createPermanentStorageKey();
    objects.set(staging, bytes);
    expect(
      await storage.createStagingPutCapability(
        staging,
        new Date("2026-09-07T00:01:00Z"),
        bytes.byteLength,
      ),
    ).toMatchObject({ key: staging, contentLength: bytes.byteLength });
    await storage.copyStagingToPermanent({ source: staging, destination: permanent });
    expect(await storage.getObjectMetadata(permanent)).toEqual({ sizeBytes: bytes.byteLength });
    await storage.deletePermanentObject(permanent);
    await storage.deletePermanentObject(permanent);
    await storage.createPrivateReadCapability(permanent, new Date("2026-09-07T00:01:00Z"), {
      contentType: "video/mp4",
      contentDisposition: "inline",
      rangeAllowed: true,
    });
    expect(privateRead).toEqual({ key: permanent, rangeAllowed: true });
  });

  it("rejects traversal and namespace confusion before adapters resolve paths", () => {
    expect(() => assertStagingStorageKey("staging/../secret")).toThrow();
    expect(() => assertPermanentStorageKey(createStagingStorageKey())).toThrow();
    expect(() => assertStagingStorageKey(createPermanentStorageKey())).toThrow();
  });
});
