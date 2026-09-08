import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { logger } from "@/lib/logging/server";
import {
  MapAssetJobHandlerRegistry,
  runAssetJobBatch,
} from "@/modules/assets/application/asset-job-runner";
import {
  createUploadExpirationHandler,
  createUploadProcessingHandler,
} from "@/modules/assets/application/upload-processing-handler";
import { createExternalUrlIngestionHandler } from "@/modules/assets/application/external-url-ingestion-handler";
import { DefaultMediaInspector } from "@/modules/assets/infrastructure";
import { createRuntimeAssetStorage } from "@/modules/assets/infrastructure/runtime-asset-storage";

const storage = createRuntimeAssetStorage();
const registry = new MapAssetJobHandlerRegistry()
  .register(
    "PROCESS_UPLOAD",
    createUploadProcessingHandler({ storage, inspector: new DefaultMediaInspector() }),
  )
  .register(
    "INGEST_EXTERNAL_URL",
    createExternalUrlIngestionHandler({ storage, inspector: new DefaultMediaInspector() }),
  )
  .register("EXPIRE_UPLOAD", createUploadExpirationHandler({ storage }));

// Deployment invokes this under a scheduler or supervisor; it is never an HTTP endpoint.
await runAssetJobBatch({
  database: db,
  workerId: `asset-runner-${randomUUID()}`,
  registry,
  logger,
});
