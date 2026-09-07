import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { logger } from "@/lib/logging/server";
import { runAssetJobBatch } from "@/modules/assets/application/asset-job-runner";

// Deployment invokes this under a scheduler or supervisor; it is never an HTTP endpoint.
await runAssetJobBatch({
  database: db,
  workerId: `asset-runner-${randomUUID()}`,
  handlers: {},
  logger,
});
