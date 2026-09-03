import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const smokeScript = fileURLToPath(
  new URL("../../../../../scripts/avalai-manual-smoke.ts", import.meta.url),
);
const packageJson = JSON.parse(
  readFileSync(new URL("../../../../../package.json", import.meta.url), "utf8"),
) as {
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

function environmentWithoutAvalAIKey(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.AVALAI_API_KEY;
  return environment;
}

describe("AvalAI manual smoke harness", () => {
  it("loads the real production adapter with the server React export condition", () => {
    expect(packageJson.dependencies?.["server-only"]).toBe("^0.0.1");
    expect(packageJson.scripts?.["ai:avalai:smoke"]).toBe(
      "node --conditions=react-server --env-file-if-exists=.env.local --import tsx ./scripts/avalai-manual-smoke.ts",
    );

    const result = spawnSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", smokeScript, "--verify-import"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: environmentWithoutAvalAIKey(),
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("AvalAI smoke harness import verified.");
  });

  it("keeps server-only protection enabled without the server React condition", () => {
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", 'import "server-only"'],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("This module cannot be imported from a Client Component");
  });
});
