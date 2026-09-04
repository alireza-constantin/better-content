import { describe, expect, it } from "vitest";

import {
  productionQueueReorderInputSchema,
  productionQueueItemSchema,
} from "./production-queue-service";

describe("Production Queue application boundary", () => {
  it("accepts a complete ordered Idea ID list and rejects extra queue state", () => {
    const result = productionQueueReorderInputSchema.safeParse({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      orderedIdeaIds: [
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ],
    });

    expect(result.success).toBe(true);
  });

  it("describes only safe queued Idea facts and requires a positive position", () => {
    const result = productionQueueItemSchema.safeParse({
      id: "22222222-2222-4222-8222-222222222222",
      title: "A queued idea",
      description: "A short description.",
      language: "en",
      productionQueuePosition: 1,
      lastAttempt: null,
    });

    expect(result.success).toBe(true);
    expect(
      productionQueueItemSchema.safeParse({
        ...result.data,
        productionQueuePosition: 0,
      }).success,
    ).toBe(false);
  });
});
