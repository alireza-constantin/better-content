import { describe, expect, it } from "vitest";

import { createLogEntry } from "./structured";

describe("structured logging", () => {
  it("keeps only approved, non-sensitive context fields", () => {
    const entry = createLogEntry("info", "workspace.lookup", {
      requestId: "request-1",
      workspaceId: "workspace-1",
      password: "must-not-log",
      token: "must-not-log",
      authorization: "must-not-log",
      databaseUrl: "must-not-log",
    });

    expect(entry).toEqual({
      level: "info",
      event: "workspace.lookup",
      requestId: "request-1",
      workspaceId: "workspace-1",
    });
  });
});
