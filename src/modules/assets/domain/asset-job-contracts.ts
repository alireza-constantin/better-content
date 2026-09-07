import { z } from "zod";

export const assetJobTypeSchema = z.enum([
  "PROCESS_UPLOAD",
  "INGEST_EXTERNAL_URL",
  "DELETE_ASSET",
  "EXPIRE_UPLOAD",
  "RECONCILE_STORAGE",
]);
export const assetJobStatusSchema = z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]);
export const assetJobFailureCodeSchema = z.enum([
  "PROCESSING_UNAVAILABLE",
  "MEDIA_SOURCE_UNAVAILABLE",
  "INVALID_MEDIA",
]);

/** Jobs carry no creator input, storage key, URL, capability, or media bytes. */
export const assetJobPayloadSchema = z.object({ assetId: z.uuid() }).strict();

export type AssetJobType = z.infer<typeof assetJobTypeSchema>;
export type AssetJobStatus = z.infer<typeof assetJobStatusSchema>;
export type AssetJobFailureCode = z.infer<typeof assetJobFailureCodeSchema>;
export type AssetJobPayload = z.infer<typeof assetJobPayloadSchema>;

export const assetJobDefaults = {
  maxAttempts: 5,
  leaseMs: 60_000,
  maxBackoffMs: 60 * 60_000,
} as const;

export function assetJobDedupeKey(type: AssetJobType, assetId: string): string {
  return `${type}:${assetId}`;
}

/** Deterministic base; callers may inject a bounded jitter source for tests. */
export function nextAssetJobRunAt(now: Date, attempts: number, random = Math.random): Date {
  const exponential = Math.min(
    1_000 * 2 ** Math.max(0, attempts - 1),
    assetJobDefaults.maxBackoffMs,
  );
  const jitter = Math.floor(exponential * 0.2 * random());
  return new Date(now.getTime() + Math.min(exponential + jitter, assetJobDefaults.maxBackoffMs));
}
