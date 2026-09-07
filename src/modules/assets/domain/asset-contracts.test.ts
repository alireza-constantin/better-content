import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assetPersistenceSchema, assetStatusSchema } from "./asset-contracts";

describe("Asset domain contracts", () => {
  const base = {
    workspaceId: randomUUID(),
    createdByUserId: "creator",
    mediaType: "IMAGE" as const,
    status: "PENDING" as const,
    displayName: "Still",
  };
  it("limits source, media, and lifecycle values", () => {
    expect(assetStatusSchema.safeParse("READY").success).toBe(true);
    expect(assetStatusSchema.safeParse("QUEUED").success).toBe(false);
  });
  it("enforces source-specific provenance", () => {
    expect(
      assetPersistenceSchema.safeParse({
        ...base,
        sourceType: "UPLOAD",
        originalFilename: "still.jpg",
      }).success,
    ).toBe(true);
    expect(
      assetPersistenceSchema.safeParse({
        ...base,
        sourceType: "EXTERNAL_URL",
        sourceUrl: "https://example.com/still.jpg",
        sourceHost: "example.com",
      }).success,
    ).toBe(true);
    expect(
      assetPersistenceSchema.safeParse({
        ...base,
        sourceType: "UPLOAD",
        sourceUrl: "https://example.com/x",
      }).success,
    ).toBe(false);
  });
});
