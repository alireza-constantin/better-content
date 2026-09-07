import type { db } from "@/db";
import type { logger } from "@/lib/logging/server";
import type { AssetJobType } from "../domain/asset-job-contracts";
import {
  claimDueAssetJobs,
  completeAssetJob,
  failAssetJob,
  heartbeatAssetJobLease,
} from "./asset-job-repository";

type AssetJobHandler = (
  input: Readonly<{ assetId: string; heartbeat: () => Promise<boolean> }>,
) => Promise<void>;

/** Server-runner seam. Ticket 04 composes real handlers; no HTTP route exists. */
export async function runAssetJobBatch(
  input: Readonly<{
    database: typeof db;
    workerId: string;
    handlers: Partial<Record<AssetJobType, AssetJobHandler>>;
    logger: Pick<typeof logger, "info" | "warn">;
    now?: () => Date;
    limit?: number;
  }>,
): Promise<number> {
  const now = input.now ?? (() => new Date());
  const claimed = await claimDueAssetJobs(input.database, {
    workerId: input.workerId,
    now: now(),
    limit: input.limit ?? 1,
  });
  for (const job of claimed) {
    const handler = input.handlers[job.type as AssetJobType];
    try {
      if (!handler) throw new Error("No Asset job handler is registered.");
      await handler({
        assetId: (job.payload as { assetId: string }).assetId,
        heartbeat: () =>
          heartbeatAssetJobLease(input.database, {
            jobId: job.id,
            workerId: input.workerId,
            now: now(),
          }),
      });
      await completeAssetJob(input.database, {
        jobId: job.id,
        workerId: input.workerId,
        now: now(),
      });
      input.logger.info("asset_job_completed", {
        module: "assets",
        operation: "job-runner",
        entityId: job.id,
      });
    } catch {
      await failAssetJob(input.database, {
        jobId: job.id,
        workerId: input.workerId,
        now: now(),
        failureCode: "PROCESSING_UNAVAILABLE",
        retryable: true,
      });
      input.logger.warn("asset_job_failed", {
        module: "assets",
        operation: "job-runner",
        entityId: job.id,
      });
    }
  }
  return claimed.length;
}
