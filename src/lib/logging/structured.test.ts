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

  it("keeps approved Content-generation diagnostics while dropping unsafe details", () => {
    const entry = createLogEntry("error", "content.generate.preflight_failed", {
      module: "content",
      operation: "generateContentScript",
      stage: "create_attempt",
      errorCode: "INTERNAL_ERROR",
      errorName: "DatabaseConstraintViolation",
      safeErrorMessage: "A database constraint rejected the generation preflight.",
      prompt: "must-not-log",
      authorization: "must-not-log",
      databaseDetail: "must-not-log",
    });

    expect(entry).toEqual({
      level: "error",
      event: "content.generate.preflight_failed",
      module: "content",
      operation: "generateContentScript",
      stage: "create_attempt",
      errorCode: "INTERNAL_ERROR",
      errorName: "DatabaseConstraintViolation",
      safeErrorMessage: "A database constraint rejected the generation preflight.",
    });
  });
});
