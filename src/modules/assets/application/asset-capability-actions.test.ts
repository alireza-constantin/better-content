import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRuntimeAssetStorage, issue } = vi.hoisted(() => ({
  createRuntimeAssetStorage: vi.fn(),
  issue: vi.fn(),
}));

vi.mock("../infrastructure/runtime-asset-storage", () => ({ createRuntimeAssetStorage }));
vi.mock("./asset-capability-service", () => ({
  createAssetCapabilityService: vi.fn(() => ({ issue })),
}));

import { issueAssetCapabilityAction } from "./asset-capability-actions";

describe("issueAssetCapabilityAction", () => {
  beforeEach(() => {
    createRuntimeAssetStorage.mockReset().mockReturnValue({ private: "storage" });
    issue.mockReset();
  });

  it("uses the shared runtime storage composition and returns only the browser capability DTO", async () => {
    issue.mockResolvedValue({
      url: "https://private.test/object?signature=redacted",
      expiresAt: new Date("2026-01-01T00:15:00.000Z"),
    });
    await expect(
      issueAssetCapabilityAction({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        assetId: "00000000-0000-4000-8000-000000000002",
        operation: "PREVIEW",
      }),
    ).resolves.toEqual({
      url: "https://private.test/object?signature=redacted",
      expiresAt: new Date("2026-01-01T00:15:00.000Z"),
    });
    expect(createRuntimeAssetStorage).toHaveBeenCalledOnce();
    expect(issue).toHaveBeenCalledOnce();
  });
});
