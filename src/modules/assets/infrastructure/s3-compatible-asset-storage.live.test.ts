import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createRuntimeAssetStorage } from "./runtime-asset-storage";
import { createPermanentStorageKey, createStagingStorageKey } from "./storage-keys";

const liveEnabled = process.env.ASSET_STORAGE_LIVE_CONTRACT === "1";
const liveEnvironment = {
  ASSET_STORAGE_DRIVER: "s3",
  ASSET_STORAGE_VERSIONING: "disabled",
  ASSET_S3_ENDPOINT: process.env.ASSET_S3_ENDPOINT,
  ASSET_S3_REGION: process.env.ASSET_S3_REGION,
  ASSET_S3_BUCKET: process.env.ASSET_S3_BUCKET,
  ASSET_S3_ACCESS_KEY_ID: process.env.ASSET_S3_ACCESS_KEY_ID,
  ASSET_S3_SECRET_ACCESS_KEY: process.env.ASSET_S3_SECRET_ACCESS_KEY,
  ASSET_S3_FORCE_PATH_STYLE: process.env.ASSET_S3_FORCE_PATH_STYLE ?? "false",
};

describe.skipIf(!liveEnabled)("opt-in S3-compatible private storage contract", () => {
  it("proves private staging, promotion, read capabilities, range support, listing, and deletion", async () => {
    const storage = createRuntimeAssetStorage(liveEnvironment);
    const staging = createStagingStorageKey();
    const permanent = createPermanentStorageKey();
    const bytes = Buffer.from(`contract-${randomUUID()}`);
    try {
      const put = await storage.createStagingPutCapability(
        staging,
        new Date(Date.now() + 4 * 60 * 60_000),
        bytes.byteLength,
      );
      expect(put.key).toBe(staging);
      expect(put.contentLength).toBe(bytes.byteLength);
      const putResponse = await fetch(put.url, {
        method: "PUT",
        body: bytes,
        headers: { "content-length": String(bytes.byteLength) },
      });
      expect(putResponse.ok).toBe(true);

      expect(await storage.getObjectMetadata(staging)).toEqual({ sizeBytes: bytes.byteLength });
      const unsigned = new URL(put.url);
      unsigned.search = "";
      expect((await fetch(unsigned)).ok).toBe(false);

      await storage.copyStagingToPermanent({ source: staging, destination: permanent });
      await storage.copyStagingToPermanent({ source: staging, destination: permanent });
      expect(await storage.getObjectMetadata(permanent)).toEqual({ sizeBytes: bytes.byteLength });

      const preview = await storage.createPrivateReadCapability(
        permanent,
        new Date(Date.now() + 900_000),
        {
          contentType: "application/octet-stream",
          contentDisposition: "inline",
          rangeAllowed: true,
        },
      );
      expect(preview.expiresAt.getTime() - Date.now()).toBeGreaterThan(898_000);
      expect(preview.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(900_000);
      const previewResponse = await fetch(preview.url);
      expect(previewResponse.status).toBe(200);
      expect(previewResponse.headers.get("content-type")).toContain("application/octet-stream");
      expect(previewResponse.headers.get("content-disposition")).toContain("inline");
      expect(previewResponse.headers.get("cache-control")).toContain("private");
      expect(Buffer.from(await previewResponse.arrayBuffer())).toEqual(bytes);

      const rangeResponse = await fetch(preview.url, { headers: { range: "bytes=0-7" } });
      expect(rangeResponse.status).toBe(206);
      expect(Buffer.from(await rangeResponse.arrayBuffer())).toEqual(bytes.subarray(0, 8));

      const download = await storage.createPrivateReadCapability(
        permanent,
        new Date(Date.now() + 900_000),
        {
          contentType: "application/octet-stream",
          contentDisposition: 'attachment; filename="contract.bin"',
          rangeAllowed: false,
        },
      );
      const downloadResponse = await fetch(download.url);
      expect(downloadResponse.headers.get("content-disposition")).toContain("attachment");

      const missing = createPermanentStorageKey();
      expect(await storage.getObjectMetadata(missing)).toBeNull();
      const page = await storage.listManagedObjects({ namespace: "permanent", limit: 500 });
      expect(page.objects.some((object) => object.key === permanent)).toBe(true);
    } finally {
      await storage.deleteStagingObject(staging);
      await storage.deleteStagingObject(staging);
      await storage.deletePermanentObject(permanent);
      await storage.deletePermanentObject(permanent);
    }
  }, 120_000);
});
