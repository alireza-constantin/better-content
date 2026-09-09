import { describe, expect, it } from "vitest";

import { createLogEntry } from "./structured";
import { formatDevelopmentLog } from "./server";

describe("development log presentation", () => {
  it("renders separated, colored, bold event headers and readable key/value rows", () => {
    const output = formatDevelopmentLog(
      createLogEntry("error", "content.generate.preflight_failed", {
        operation: "generateContentScript",
        stage: "create_attempt",
        errorCode: "INTERNAL_ERROR",
        errorCategory: "UNKNOWN",
        safeErrorMessage: "A database constraint rejected the generation preflight.",
      }),
      new Date("2026-09-09T08:10:11.000Z"),
    );

    const lines = output.split("\n");
    expect(lines).toHaveLength(8);
    expect(lines[0]).toContain("────────────────");
    expect(lines[1]).toContain("ERROR");
    expect(lines[1]).toContain("content.generate.preflight_failed");
    expect(lines[2]).toContain("operation");
    expect(lines[2]).toContain("generateContentScript");
    expect(lines[5]).toContain("errorCategory");
    expect(lines[5]).toContain("UNKNOWN");
    expect(lines[6]).toContain("error");
    expect(lines[7]).toContain("────────────────");
    expect(output).toContain("\u001b[1m");
    expect(output).toContain("\u001b[36m");
    expect(output).toContain("\u001b[31m");
  });
});
