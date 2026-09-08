import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

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
import { DefaultMediaInspector, FilesystemAssetStorage } from "@/modules/assets/infrastructure";

const storage = new FilesystemAssetStorage(
  process.env.ASSET_STORAGE_ROOT ?? resolve(process.cwd(), ".data", "asset-storage"),
);
const registry = new MapAssetJobHandlerRegistry()
  .register(
    "PROCESS_UPLOAD",
    createUploadProcessingHandler({ storage, inspector: new DefaultMediaInspector() }),
  )
  .register("EXPIRE_UPLOAD", createUploadExpirationHandler({ storage }));

// Deployment invokes this under a scheduler or supervisor; it is never an HTTP endpoint.
await runAssetJobBatch({
  database: db,
  workerId: `asset-runner-${randomUUID()}`,
  registry,
  logger,
});
