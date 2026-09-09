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
import { DefaultMediaInspector } from "@/modules/assets/infrastructure";
import { createRuntimeAssetStorage } from "@/modules/assets/infrastructure/runtime-asset-storage";

// This is a deterministic Playwright seam. Production invokes the guarded
// scripts/run-asset-jobs.ts entrypoint, including its deployment preflight.
const storage = createRuntimeAssetStorage();
const inspector = new DefaultMediaInspector();
const registry = new MapAssetJobHandlerRegistry()
  .register("PROCESS_UPLOAD", createUploadProcessingHandler({ storage, inspector }))
  .register("INGEST_EXTERNAL_URL", createExternalUrlIngestionHandler({ storage, inspector }))
  .register("EXPIRE_UPLOAD", createUploadExpirationHandler({ storage }))
  .register("DELETE_ASSET", createAssetDeletionHandler({ storage }));

await runAssetJobBatch({
  database: db,
  workerId: "e2e-asset-runner-" + randomUUID(),
  registry,
  logger,
});
