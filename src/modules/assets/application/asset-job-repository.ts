import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { assetJobs } from "@/db/schema";
import {
  assetJobDefaults,
  assetJobDedupeKey,
  assetJobPayloadSchema,
  nextAssetJobRunAt,
  type AssetJobFailureCode,
  type AssetJobPayload,
  type AssetJobType,
} from "../domain/asset-job-contracts";
import {
  createPermanentStorageKey,
  type PermanentStorageKey,
} from "../infrastructure/storage-keys";

type AssetJobDatabase = Pick<typeof db, "execute" | "insert" | "select" | "update">;
type JobRow = typeof assetJobs.$inferSelect;

export async function createAssetJob(
  database: AssetJobDatabase,
  input: Readonly<{
    type: AssetJobType;
    payload: AssetJobPayload;
    scheduledAt?: Date;
    maxAttempts?: number;
  }>,
): Promise<JobRow> {
  const payload = assetJobPayloadSchema.parse(input.payload);
  const dedupeKey = assetJobDedupeKey(input.type, payload.assetId);
  await database
    .insert(assetJobs)
    .values({
      type: input.type,
      dedupeKey,
      payload,
      scheduledAt: input.scheduledAt,
      maxAttempts: input.maxAttempts ?? assetJobDefaults.maxAttempts,
    })
    .onConflictDoNothing();
  const [job] = await database.select().from(assetJobs).where(eq(assetJobs.dedupeKey, dedupeKey));
  if (!job) throw new Error("Asset job insertion did not return a durable workflow.");
  return job;
}

/** Atomically reclaims expired leases and claims due jobs without double ownership. */
export async function claimDueAssetJobs(
  database: Pick<typeof db, "execute">,
  input: Readonly<{ workerId: string; now: Date; limit?: number; leaseMs?: number }>,
): Promise<JobRow[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 1, 10));
  const leaseExpiresAt = new Date(
    input.now.getTime() + (input.leaseMs ?? assetJobDefaults.leaseMs),
  );
  const result = await database.execute(sql`
    WITH exhausted_leases AS (
      UPDATE asset_jobs
      SET status = 'FAILED', failed_at = ${input.now}, lease_owner = NULL, lease_expires_at = NULL,
          failure_code = 'PROCESSING_UNAVAILABLE', updated_at = ${input.now}
      WHERE status = 'RUNNING' AND lease_expires_at <= ${input.now} AND attempts >= max_attempts
    ), candidates AS (
      SELECT id
      FROM asset_jobs
      WHERE (status = 'PENDING' AND scheduled_at <= ${input.now})
         OR (status = 'RUNNING' AND lease_expires_at <= ${input.now} AND attempts < max_attempts)
      ORDER BY scheduled_at ASC, created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE asset_jobs AS job
    SET status = 'RUNNING', attempts = job.attempts + 1, lease_owner = ${input.workerId},
        lease_expires_at = ${leaseExpiresAt}, failure_code = NULL, updated_at = ${input.now}
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING job.id AS "id", job.type AS "type", job.dedupe_key AS "dedupeKey",
      job.payload AS "payload", job.status AS "status", job.scheduled_at AS "scheduledAt",
      job.attempts AS "attempts", job.max_attempts AS "maxAttempts",
      job.lease_owner AS "leaseOwner", job.lease_expires_at AS "leaseExpiresAt",
      job.failure_code AS "failureCode", job.completed_at AS "completedAt",
      job.failed_at AS "failedAt", job.created_at AS "createdAt", job.updated_at AS "updatedAt"
  `);
  return result.rows as JobRow[];
}

export async function heartbeatAssetJobLease(
  database: Pick<typeof db, "update">,
  input: Readonly<{ jobId: string; workerId: string; now: Date; leaseMs?: number }>,
): Promise<boolean> {
  const result = await database
    .update(assetJobs)
    .set({
      leaseExpiresAt: new Date(input.now.getTime() + (input.leaseMs ?? assetJobDefaults.leaseMs)),
      updatedAt: input.now,
    })
    .where(
      and(
        eq(assetJobs.id, input.jobId),
        eq(assetJobs.status, "RUNNING"),
        eq(assetJobs.leaseOwner, input.workerId),
      ),
    )
    .returning({ id: assetJobs.id });
  return result.length === 1;
}

export async function completeAssetJob(
  database: Pick<typeof db, "update">,
  input: Readonly<{ jobId: string; workerId: string; now: Date }>,
): Promise<boolean> {
  const result = await database
    .update(assetJobs)
    .set({
      status: "COMPLETED",
      completedAt: input.now,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(assetJobs.id, input.jobId),
        eq(assetJobs.status, "RUNNING"),
        eq(assetJobs.leaseOwner, input.workerId),
      ),
    )
    .returning({ id: assetJobs.id });
  return result.length === 1;
}

export async function failAssetJob(
  database: Pick<typeof db, "select" | "update">,
  input: Readonly<{
    jobId: string;
    workerId: string;
    now: Date;
    failureCode: AssetJobFailureCode;
    retryable: boolean;
    random?: () => number;
  }>,
): Promise<"RETRY_SCHEDULED" | "FAILED" | "OWNERSHIP_LOST"> {
  const [job] = await database.select().from(assetJobs).where(eq(assetJobs.id, input.jobId));
  if (!job || job.status !== "RUNNING" || job.leaseOwner !== input.workerId)
    return "OWNERSHIP_LOST";
  const retry = input.retryable && job.attempts < job.maxAttempts;
  const result = await database
    .update(assetJobs)
    .set({
      status: retry ? "PENDING" : "FAILED",
      scheduledAt: retry
        ? nextAssetJobRunAt(input.now, job.attempts, input.random)
        : job.scheduledAt,
      failedAt: retry ? null : input.now,
      failureCode: input.failureCode,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(assetJobs.id, input.jobId),
        eq(assetJobs.status, "RUNNING"),
        eq(assetJobs.leaseOwner, input.workerId),
      ),
    )
    .returning({ id: assetJobs.id });
  if (!result.length) return "OWNERSHIP_LOST";
  return retry ? "RETRY_SCHEDULED" : "FAILED";
}

/** PostgreSQL reserves ownership before any future processor writes permanent bytes. */
export async function reserveAssetPermanentStorageKey(
  database: Pick<typeof db, "execute">,
  assetId: string,
  candidateKey: PermanentStorageKey = createPermanentStorageKey(),
): Promise<PermanentStorageKey | null> {
  const result = await database.execute(sql`
    UPDATE assets
    SET permanent_key = COALESCE(permanent_key, ${candidateKey}), updated_at = now()
    WHERE id = ${assetId}
    RETURNING permanent_key AS "permanentKey"
  `);
  const row = result.rows[0] as { permanentKey: string } | undefined;
  return (row?.permanentKey as PermanentStorageKey | undefined) ?? null;
}
