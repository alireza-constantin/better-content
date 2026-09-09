import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { logger } from "@/lib/logging/server";
import {
  MapAssetJobHandlerRegistry,
  runAssetJobBatch,
} from "@/modules/assets/application/asset-job-runner";
import { createAssetDeletionHandler } from "@/modules/assets/application/asset-deletion-handler";
import {
  createUploadExpirationHandler,
  createUploadProcessingHandler,
} from "@/modules/assets/application/upload-processing-handler";
import { createExternalUrlIngestionHandler } from "@/modules/assets/application/external-url-ingestion-handler";
import { DefaultMediaInspector, FfprobeMediaInspector } from "@/modules/assets/infrastructure";
import { createRuntimeAssetStorage } from "@/modules/assets/infrastructure/runtime-asset-storage";
import { verifyAssetWorkerDeployment } from "@/modules/assets/infrastructure/asset-worker-preflight";

const storage = createRuntimeAssetStorage();
const inspector = new DefaultMediaInspector();
const ffprobe = new FfprobeMediaInspector({
  executablePath: process.env.FFPROBE_PATH ?? "",
  expectedVersion: process.env.FFPROBE_EXPECTED_VERSION,
});
await verifyAssetWorkerDeployment({ database: db, storage, inspector: ffprobe });
const registry = new MapAssetJobHandlerRegistry()
  .register("PROCESS_UPLOAD", createUploadProcessingHandler({ storage, inspector }))
  .register("INGEST_EXTERNAL_URL", createExternalUrlIngestionHandler({ storage, inspector }))
  .register("EXPIRE_UPLOAD", createUploadExpirationHandler({ storage }))
  .register("DELETE_ASSET", createAssetDeletionHandler({ storage }));

// Deployment invokes this under a scheduler or supervisor; it is never an HTTP endpoint.
let shuttingDown = false;
let running: Promise<number> | undefined;
const shutdown = () => {
  shuttingDown = true;
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

if (!shuttingDown) {
  running = runAssetJobBatch({
    database: db,
    workerId: `asset-runner-${randomUUID()}`,
    registry,
    logger,
  });
  await running;
}
