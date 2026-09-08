import { randomUUID } from "node:crypto";

import { AssetStorageError } from "./asset-storage";

export type StagingStorageKey = `staging/${string}`;
export type PermanentStorageKey = `permanent/${string}`;
export type AssetStorageKey = StagingStorageKey | PermanentStorageKey;

const opaqueKeyPattern =
  /^(staging|permanent)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createStagingStorageKey(): StagingStorageKey {
  return `staging/${randomUUID()}`;
}

export function createPermanentStorageKey(): PermanentStorageKey {
  return `permanent/${randomUUID()}`;
}

export function assertStorageKey(key: string): AssetStorageKey {
  if (typeof key !== "string" || !opaqueKeyPattern.test(key))
    throw new AssetStorageError("Invalid private Asset storage key.", "INVALID_KEY");
  return key as AssetStorageKey;
}

export function assertStagingStorageKey(key: string): StagingStorageKey {
  if (typeof key !== "string" || !key.startsWith("staging/"))
    throw new AssetStorageError("Expected a staging Asset storage key.", "INVALID_KEY");
  return assertStorageKey(key) as StagingStorageKey;
}

export function assertPermanentStorageKey(key: string): PermanentStorageKey {
  if (typeof key !== "string" || !key.startsWith("permanent/"))
    throw new AssetStorageError("Expected a permanent Asset storage key.", "INVALID_KEY");
  return assertStorageKey(key) as PermanentStorageKey;
}
