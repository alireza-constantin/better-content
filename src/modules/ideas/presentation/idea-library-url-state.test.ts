import { describe, expect, it } from "vitest";

import { ideaLibraryHref, parseIdeaLibraryUrlState } from "./idea-library-url-state";

describe("Idea Library URL state", () => {
  it("defaults to New plus All runs and normalizes unsupported views", () => {
    expect(parseIdeaLibraryUrlState({})).toEqual({
      view: "new",
      statusFilter: "NEW",
      batchId: null,
    });
    expect(parseIdeaLibraryUrlState({ view: "unexpected", batchId: "batch-id" })).toEqual({
      view: "new",
      statusFilter: "NEW",
      batchId: "batch-id",
    });
  });

  it("uses the documented status and optional run vocabulary", () => {
    expect(parseIdeaLibraryUrlState({ view: "saved", batchId: "batch-id" })).toEqual({
      view: "saved",
      statusFilter: "SAVED",
      batchId: "batch-id",
    });
    expect(ideaLibraryHref({ statusFilter: "NEW", batchId: null })).toBe("/ideas");
    expect(ideaLibraryHref({ statusFilter: "SAVED", batchId: null })).toBe("/ideas?view=saved");
    expect(ideaLibraryHref({ statusFilter: "ACCEPTED", batchId: "batch-id" })).toBe(
      "/ideas?view=accepted&batchId=batch-id",
    );
  });
});
