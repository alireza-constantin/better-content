import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { assetJobDedupeKey, assetJobPayloadSchema, nextAssetJobRunAt } from "./asset-job-contracts";

describe("Asset job contracts", () => {
  it("accepts only the stable Asset identity payload", () => {
    expect(assetJobPayloadSchema.safeParse({ assetId: randomUUID() }).success).toBe(true);
    expect(
      assetJobPayloadSchema.safeParse({ assetId: randomUUID(), sourceUrl: "https://x.test" })
        .success,
    ).toBe(false);
  });

  it("derives one logical workflow key per type and Asset", () => {
    const assetId = randomUUID();
    expect(assetJobDedupeKey("PROCESS_UPLOAD", assetId)).toBe(`PROCESS_UPLOAD:${assetId}`);
  });

  it("uses bounded exponential retry scheduling", () => {
    const now = new Date("2026-09-07T00:00:00.000Z");
    expect(nextAssetJobRunAt(now, 1, () => 0).getTime() - now.getTime()).toBe(1_000);
    expect(nextAssetJobRunAt(now, 99, () => 1).getTime() - now.getTime()).toBeLessThanOrEqual(
      3_600_000,
    );
  });
});
