import type { db } from "@/db";
import type { logger } from "@/lib/logging/server";
import {
  assetJobHandlerResultSchema,
  assetJobPayloadSchema,
  type AssetJobHandlerResult,
  type AssetJobType,
} from "../domain/asset-job-contracts";
import {
  claimDueAssetJobs,
  completeAssetJob,
  failAssetJob,
  heartbeatAssetJobLease,
} from "./asset-job-repository";

export type AssetJobHandler = (
  input: Readonly<{
    assetId: string;
    attempts: number;
    maxAttempts: number;
    heartbeat: () => Promise<boolean>;
  }>,
) => Promise<AssetJobHandlerResult | void>;

export interface AssetJobHandlerRegistry {
  get(type: AssetJobType): AssetJobHandler | undefined;
}

export class MapAssetJobHandlerRegistry implements AssetJobHandlerRegistry {
  private readonly handlers = new Map<AssetJobType, AssetJobHandler>();

  constructor(handlers: Partial<Record<AssetJobType, AssetJobHandler>> = {}) {
    for (const [type, handler] of Object.entries(handlers)) {
      if (handler) this.register(type as AssetJobType, handler);
    }
  }

  register(type: AssetJobType, handler: AssetJobHandler): this {
    if (this.handlers.has(type)) throw new Error(`Asset job handler already registered: ${type}`);
    this.handlers.set(type, handler);
    return this;
  }

  get(type: AssetJobType): AssetJobHandler | undefined {
    return this.handlers.get(type);
  }
}

/** Server-runner seam. Ticket 04 composes real handlers; no HTTP route exists. */
export async function runAssetJobBatch(
  input: Readonly<{
    database: typeof db;
    workerId: string;
    registry: AssetJobHandlerRegistry;
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
    const handler = input.registry.get(job.type as AssetJobType);
    try {
      const { assetId } = assetJobPayloadSchema.parse(job.payload);
      const result: AssetJobHandlerResult | void = handler
        ? await handler({
            assetId,
            attempts: job.attempts,
            maxAttempts: job.maxAttempts,
            heartbeat: () =>
              heartbeatAssetJobLease(input.database, {
                jobId: job.id,
                workerId: input.workerId,
                now: now(),
              }),
          })
        : {
            kind: "FAILED" as const,
            failureCode: "PROCESSING_UNAVAILABLE" as const,
            retryable: true,
          };
      const normalized = result
        ? assetJobHandlerResultSchema.parse(result)
        : ({ kind: "COMPLETED" } as const);
      if (normalized.kind === "FAILED") {
        await failAssetJob(input.database, {
          jobId: job.id,
          workerId: input.workerId,
          now: now(),
          failureCode: normalized.failureCode,
          retryable: normalized.retryable,
        });
        input.logger.warn("asset_job_failed", {
          module: "assets",
          operation: "job-runner",
          entityId: job.id,
          errorCategory: normalized.failureCode,
        });
        continue;
      }
      const completed = await completeAssetJob(input.database, {
        jobId: job.id,
        workerId: input.workerId,
        now: now(),
      });
      if (completed)
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
