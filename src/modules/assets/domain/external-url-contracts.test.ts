import { describe, expect, it } from "vitest";

import { normalizeExternalMediaUrl } from "./external-url-contracts";

describe("normalizeExternalMediaUrl", () => {
  it("persists a fragment-free HTTPS URL and an ASCII hostname only", () => {
    expect(normalizeExternalMediaUrl("https://BÜCHER.example/media?id=1#preview")).toEqual({
      sourceUrl: "https://xn--bcher-kva.example/media?id=1",
      sourceHost: "xn--bcher-kva.example",
    });
  });

  it.each([
    "http://example.com/media",
    "https://user@example.com/media",
    "https://example.com:444/media",
    "ftp://example.com/media",
    "data:text/plain,media",
    "javascript:alert(1)",
    "https://example.com:444/media",
  ])("rejects unsafe or unsupported URL syntax: %s", (sourceUrl) => {
    expect(() => normalizeExternalMediaUrl(sourceUrl)).toThrow("INVALID_EXTERNAL_MEDIA_URL");
  });

  it("preserves queries but rejects normalized URLs over the UTF-8 byte limit", () => {
    expect(normalizeExternalMediaUrl("https://example.com/media?token=ok").sourceUrl).toBe(
      "https://example.com/media?token=ok",
    );
    expect(() => normalizeExternalMediaUrl(`https://example.com/?q=${"a".repeat(4_100)}`)).toThrow(
      "INVALID_EXTERNAL_MEDIA_URL",
    );
  });
});
