import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("production queue migration", () => {
  it("adds nullable positive ordering metadata and deterministic eligible backfill", async () => {
    const migration = await readFile("drizzle/0007_overjoyed_thunderbolt_ross.sql", "utf8");

    expect(migration).toContain('ADD COLUMN "production_queue_position" integer');
    expect(migration).toContain('ADD CONSTRAINT "ideas_production_queue_position_positive_check"');
    expect(migration).toContain("WITH eligible_ideas AS");
    expect(migration).toContain("i.status = 'ACCEPTED'");
    expect(migration).toContain("NOT EXISTS");
    expect(migration).toContain("b.created_at ASC, i.position ASC, i.id ASC");
    expect(migration).toContain("PARTITION BY b.workspace_id");
    expect(migration).not.toContain("status_changed_at");
  });
});
