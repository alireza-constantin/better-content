import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("global typography", () => {
  it("uses semantic language selectors instead of route-local font selection", () => {
    expect(stylesheet).toContain("--font-sans: var(--font-latin);");
    expect(stylesheet).toMatch(/:lang\(en\)\s*\{\s*font-family: var\(--font-latin\), sans-serif;/);
    expect(stylesheet).toMatch(
      /:lang\(fa\)\s*\{\s*font-family: var\(--font-persian\), var\(--font-latin\), sans-serif;/,
    );
    expect(stylesheet).not.toContain("data-locale");
    expect(stylesheet).not.toContain("font-content-persian");
  });
});
