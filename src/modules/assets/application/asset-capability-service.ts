import "server-only";

import { z } from "zod";

import { assetCapabilityLifetimeMs } from "../domain/asset-capability-contracts";
import { db } from "@/db";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError } from "@/lib/errors/app-error";
import { requireWorkspaceMembership } from "@/modules/workspace/application";
import type { AssetStorage, PrivateReadOptions } from "../infrastructure/asset-storage";
import { assertPermanentStorageKey } from "../infrastructure/storage-keys";
import { findAsset } from "./asset-repository";

export {
  activeMediaRefreshLeadMs,
  assetCapabilityLifetimeMs,
} from "../domain/asset-capability-contracts";
const capabilityRequestSchema = z
  .object({ workspaceId: z.uuid(), assetId: z.uuid(), operation: z.enum(["PREVIEW", "DOWNLOAD"]) })
  .strict();

export type AssetCapability = Readonly<{
  url: string;
  expiresAt: Date;
  cacheControl: "private, no-store";
  contentType: string;
  contentDisposition: string;
  rangeAllowed: boolean;
}>;

export function createAssetCapabilityService(
  dependencies: Readonly<{
    storage: AssetStorage;
    database?: typeof db;
    getAuthenticatedUserId?: () => Promise<string | null>;
    clock?: () => Date;
  }>,
) {
  const database = dependencies.database ?? db;
  const user =
    dependencies.getAuthenticatedUserId ??
    (async () => (await getServerSession())?.user.id ?? null);
  const clock = dependencies.clock ?? (() => new Date());
  return {
    async issue(input: unknown): Promise<AssetCapability> {
      const parsed = capabilityRequestSchema.safeParse(input);
      if (!parsed.success)
        throw new ApplicationError("VALIDATION_ERROR", "The media request is invalid.");
      const userId = await user();
      if (!userId) throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      await requireWorkspaceMembership(userId, parsed.data.workspaceId, database);
      const asset = await findAsset(database, {
        workspaceId: parsed.data.workspaceId,
        assetId: parsed.data.assetId,
      });
      if (!asset) throw new ApplicationError("NOT_FOUND", "The Asset was not found.");
      if (
        asset.status !== "READY" ||
        !asset.permanentKey ||
        !asset.detectedMimeType ||
        !asset.mediaFormat
      )
        throw new ApplicationError("CONFLICT", "The Asset is not available.");
      const options = responseOptions(
        {
          mediaType: asset.mediaType,
          detectedMimeType: asset.detectedMimeType,
          mediaFormat: asset.mediaFormat,
          displayName: asset.displayName,
        },
        parsed.data.operation,
      );
      const capability = await dependencies.storage.createPrivateReadCapability(
        assertPermanentStorageKey(asset.permanentKey),
        new Date(clock().getTime() + assetCapabilityLifetimeMs),
        options,
      );
      return { ...capability, cacheControl: "private, no-store", ...options };
    },
  };
}

function responseOptions(
  asset: Readonly<{
    mediaType: string;
    detectedMimeType: string;
    mediaFormat: string;
    displayName: string;
  }>,
  operation: "PREVIEW" | "DOWNLOAD",
): PrivateReadOptions {
  const filename = downloadFilename(asset.displayName, asset.mediaFormat);
  return {
    contentType: asset.detectedMimeType,
    contentDisposition: operation === "DOWNLOAD" ? attachmentDisposition(filename) : "inline",
    rangeAllowed: asset.mediaType === "VIDEO" || asset.mediaType === "AUDIO",
  };
}

export function downloadFilename(displayName: string, mediaFormat: string): string {
  const extension = (
    {
      JPEG: ".jpg",
      PNG: ".png",
      WEBP: ".webp",
      MP4: ".mp4",
      MP3: ".mp3",
      M4A: ".m4a",
      WAV: ".wav",
    } as const
  )[mediaFormat];
  if (!extension) throw new ApplicationError("CONFLICT", "The Asset format is unavailable.");
  const safe = displayName.replace(/[\u0000-\u001f\u007f-\u009f\r\n"]/gu, "").trim() || "media";
  return safe.toLowerCase().endsWith(extension) ? safe : `${safe}${extension}`;
}

export function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "media";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
