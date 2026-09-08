"use server";

import { ApplicationError, type ApplicationErrorCode } from "@/lib/errors/app-error";
import { createExternalUrlApplicationService } from "./external-url-service";
import { createRuntimeAssetStorage } from "../infrastructure/runtime-asset-storage";
import {
  createAssetLibraryApplicationService,
  type AssetLibraryDto,
  type AssetLibraryItemDto,
} from "./asset-library-service";
import {
  createAssetDeletionApplicationService,
  type DeleteAssetResult,
} from "./asset-deletion-service";
import {
  createUploadApplicationService,
  type BeginUploadResult,
  type FinalizeUploadResult,
} from "./upload-service";

type ActionFailure = Readonly<{ ok: false; code: ApplicationErrorCode }>;
type ActionSuccess<T> = Readonly<{ ok: true; value: T }>;
type ActionResult<T> = ActionSuccess<T> | ActionFailure;

function resultFrom<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  return operation()
    .then((value) => ({ ok: true, value }) as ActionSuccess<T>)
    .catch((error: unknown) => ({
      ok: false,
      code: error instanceof ApplicationError ? error.code : "INTERNAL_ERROR",
    }));
}

/** Browser-facing adapters. All authorization and media lifecycle logic stays in application services. */
export async function getAssetLibraryAction(
  input: unknown,
): Promise<ActionResult<AssetLibraryDto>> {
  return resultFrom(() => createAssetLibraryApplicationService().getAssetLibrary(input));
}

export async function renameAssetAction(
  input: unknown,
): Promise<ActionResult<AssetLibraryItemDto>> {
  return resultFrom(() => createAssetLibraryApplicationService().renameAsset(input));
}

export async function deleteAssetAction(input: unknown): Promise<ActionResult<DeleteAssetResult>> {
  return resultFrom(() => createAssetDeletionApplicationService().deleteAsset(input));
}

export async function beginAssetUploadAction(
  input: unknown,
): Promise<ActionResult<BeginUploadResult>> {
  return resultFrom(() =>
    createUploadApplicationService({ storage: createRuntimeAssetStorage() }).beginUpload(input),
  );
}

export async function finalizeAssetUploadAction(
  input: unknown,
): Promise<ActionResult<FinalizeUploadResult>> {
  return resultFrom(() =>
    createUploadApplicationService({ storage: createRuntimeAssetStorage() }).finalizeUpload(input),
  );
}

export async function createExternalAssetLinkAction(
  input: unknown,
): Promise<
  ActionResult<
    Awaited<
      ReturnType<ReturnType<typeof createExternalUrlApplicationService>["createExternalUrlAsset"]>
    >
  >
> {
  return resultFrom(() => createExternalUrlApplicationService().createExternalUrlAsset(input));
}
