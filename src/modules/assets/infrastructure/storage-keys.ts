import { randomUUID } from "node:crypto";

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
  if (!opaqueKeyPattern.test(key)) throw new Error("Invalid private Asset storage key.");
  return key as AssetStorageKey;
}

export function assertStagingStorageKey(key: string): StagingStorageKey {
  if (!key.startsWith("staging/")) throw new Error("Expected a staging Asset storage key.");
  return assertStorageKey(key) as StagingStorageKey;
}

export function assertPermanentStorageKey(key: string): PermanentStorageKey {
  if (!key.startsWith("permanent/")) throw new Error("Expected a permanent Asset storage key.");
  return assertStorageKey(key) as PermanentStorageKey;
}
