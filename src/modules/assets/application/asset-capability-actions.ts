"use server";

import { createRuntimeAssetStorage } from "../infrastructure/runtime-asset-storage";
import { createAssetCapabilityService } from "./asset-capability-service";

export type AssetCapabilityActionResult = Readonly<{ url: string; expiresAt: Date }>;

export async function issueAssetCapabilityAction(
  input: unknown,
): Promise<AssetCapabilityActionResult> {
  try {
    const result = await createAssetCapabilityService({
      storage: createRuntimeAssetStorage(),
    }).issue(input);
    return { url: result.url, expiresAt: result.expiresAt };
  } catch {
    // The client only needs a localized access failure, never internal error details.
    throw new Error("Unable to access this media.");
  }
}
