import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  assetByteLimits,
  hasCompatibleExtension,
  isSafeCreatorText,
  isSafeLeafFilename,
  isUploadCapabilityEligible,
  normalizeUploadBeginInput,
} from "./upload-contracts";

describe("upload contracts", () => {
  it("accepts a Unicode leaf filename and does not use browser MIME as authority", () => {
    expect(
      normalizeUploadBeginInput({
        workspaceId: randomUUID(),
        mediaType: "IMAGE",
        displayName: "  Persian still  ",
        originalFilename: "تصویر.JPG",
        expectedUploadSizeBytes: 42,
        browserMimeType: "application/octet-stream",
      }),
    ).toMatchObject({ displayName: "Persian still", originalFilename: "تصویر.JPG" });
  });

  it("enforces the declared type, supported extension, positive size, and byte limit", () => {
    expect(hasCompatibleExtension("clip.mp4", "VIDEO")).toBe(true);
    expect(hasCompatibleExtension("clip.mp4", "AUDIO")).toBe(false);
    expect(isSafeLeafFilename("folder/clip.mp4")).toBe(false);
    expect(isSafeCreatorText("name\u202E.txt")).toBe(false);
    expect(() =>
      normalizeUploadBeginInput({
        workspaceId: randomUUID(),
        mediaType: "IMAGE",
        displayName: "still",
        originalFilename: "still.png",
        expectedUploadSizeBytes: assetByteLimits.IMAGE + 1,
      }),
    ).toThrow("INVALID_UPLOAD_INPUT");
  });

  it("allows capability refresh only for an unfinalized young pending upload", () => {
    const now = new Date("2026-09-08T00:00:00Z");
    const base = {
      sourceType: "UPLOAD",
      status: "PENDING",
      createdAt: new Date("2026-09-07T12:00:00Z"),
      now,
    };
    expect(isUploadCapabilityEligible({ ...base, finalized: false })).toBe(true);
    expect(isUploadCapabilityEligible({ ...base, finalized: true })).toBe(false);
    expect(
      isUploadCapabilityEligible({
        ...base,
        now: new Date("2026-09-08T12:00:00Z"),
        finalized: false,
      }),
    ).toBe(false);
  });
});
