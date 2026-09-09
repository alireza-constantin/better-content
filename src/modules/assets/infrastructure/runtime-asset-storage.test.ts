import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { FilesystemAssetStorage } from "./filesystem-asset-storage";
import { createRuntimeAssetStorage } from "./runtime-asset-storage";
import {
  S3CompatibleAssetStorage,
  type S3CompatiblePrivateObjectClient,
} from "./s3-compatible-asset-storage";

function fakeS3Client(): S3CompatiblePrivateObjectClient {
  return {
    issueStagingPut: async () => ({ url: "https://storage.test/staging" }),
    head: async () => null,
    get: async () => Readable.from([]),
    putStaging: async () => undefined,
    putIfAbsent: async () => undefined,
    copyIfAbsent: async () => undefined,
    delete: async () => undefined,
    list: async () => ({ objects: [], nextCursor: null }),
    issuePrivateRead: async () => ({ url: "https://storage.test/private" }),
  };
}

const s3Environment = {
  ASSET_STORAGE_DRIVER: "s3",
  ASSET_S3_ENDPOINT: "https://objects.example.test",
  ASSET_S3_REGION: "us-east-1",
  ASSET_S3_BUCKET: "private-assets",
  ASSET_S3_ACCESS_KEY_ID: "test-access-key",
  ASSET_S3_SECRET_ACCESS_KEY: "test-secret",
  ASSET_S3_FORCE_PATH_STYLE: "true",
  ASSET_STORAGE_VERSIONING: "disabled",
};

describe("runtime AssetStorage composition", () => {
  it("creates filesystem storage only when explicitly configured", () => {
    expect(
      createRuntimeAssetStorage({
        ASSET_STORAGE_DRIVER: "filesystem",
        ASSET_STORAGE_ROOT: ".test-assets",
      }),
    ).toBeInstanceOf(FilesystemAssetStorage);
    expect(() => createRuntimeAssetStorage({})).toThrow("ASSET_STORAGE_DRIVER");
  });

  it("creates S3-compatible storage through the deterministic provider seam", () => {
    const createS3ObjectClient = vi.fn(() => fakeS3Client());
    const storage = createRuntimeAssetStorage(s3Environment, { createS3ObjectClient });
    expect(storage).toBeInstanceOf(S3CompatibleAssetStorage);
    expect(createS3ObjectClient).toHaveBeenCalledWith({
      endpoint: "https://objects.example.test",
      region: "us-east-1",
      bucket: "private-assets",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret",
      forcePathStyle: true,
    });
  });

  it("fails fast for malformed production S3 configuration instead of falling back", () => {
    expect(() => createRuntimeAssetStorage({ ASSET_STORAGE_DRIVER: "s3" })).toThrow(
      "ASSET_S3_ENDPOINT",
    );
    expect(() =>
      createRuntimeAssetStorage({ ...s3Environment, ASSET_S3_FORCE_PATH_STYLE: "sometimes" }),
    ).toThrow("ASSET_S3_FORCE_PATH_STYLE");
    expect(() =>
      createRuntimeAssetStorage({ ...s3Environment, ASSET_STORAGE_VERSIONING: "enabled" }),
    ).toThrow("ASSET_STORAGE_VERSIONING");
    expect(() =>
      createRuntimeAssetStorage({
        ...s3Environment,
        NEXT_PUBLIC_ASSET_S3_SECRET_ACCESS_KEY: "leaked",
      }),
    ).toThrow("ASSET_S3_SECRET_ACCESS_KEY");
  });
});
