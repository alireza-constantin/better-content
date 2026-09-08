import { describe, expect, it } from "vitest";

import { assetLibraryHref, parseAssetLibraryUrlState } from "./asset-library-url-state";

describe("Asset Library URL state", () => {
  it("round-trips bounded page, literal search, and filters", () => {
    const state = parseAssetLibraryUrlState({
      page: "2",
      q: "100%_cover",
      type: "IMAGE",
      status: "READY",
    });
    expect(state).toEqual({ page: 2, search: "100%_cover", mediaType: "IMAGE", status: "READY" });
    expect(assetLibraryHref(state)).toBe("/assets?page=2&q=100%25_cover&type=IMAGE&status=READY");
  });

  it("drops invalid URL state to safe defaults", () => {
    expect(parseAssetLibraryUrlState({ page: "-1", type: "SCRIPT", status: "MISSING" })).toEqual({
      page: 1,
      search: "",
      mediaType: null,
      status: null,
    });
  });
});
