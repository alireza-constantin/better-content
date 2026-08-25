import { describe, expect, it } from "vitest";

import { getTextDirection, isAppLocale, routing } from "./routing";

describe("i18n routing", () => {
  it("supports the approved application locales with English as the default", () => {
    expect(routing.locales).toEqual(["en", "fa"]);
    expect(routing.defaultLocale).toBe("en");
  });

  it("recognizes only supported application locales", () => {
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("fa")).toBe(true);
    expect(isAppLocale("de")).toBe(false);
    expect(isAppLocale(undefined)).toBe(false);
  });

  it("selects the correct text direction for each supported locale", () => {
    expect(getTextDirection("en")).toBe("ltr");
    expect(getTextDirection("fa")).toBe("rtl");
  });
});
