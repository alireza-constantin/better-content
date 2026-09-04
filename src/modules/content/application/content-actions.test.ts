import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  getContentDraft: vi.fn(),
  saveContentDraft: vi.fn(),
}));

vi.mock("./content-application", () => ({
  getContentDetail: vi.fn(),
  getContentDraft: mocks.getContentDraft,
  getContentGenerationAttemptDetail: vi.fn(),
  getContentGenerationAttemptResult: vi.fn(),
  getIdeaContentGenerationHistory: vi.fn(),
  getIdeaContentUsage: vi.fn(),
  listContent: vi.fn(),
  retryContentGenerationAttempt: vi.fn(),
  saveContentDraft: mocks.saveContentDraft,
}));

import { getContentDraftAction, saveContentDraftAction } from "./content-actions";

const draft = {
  document: { schemaVersion: 1 as const, script: { text: "Saved text" } },
  revision: 2,
  updatedAt: new Date("2026-09-01T10:01:00.000Z"),
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("Content Draft browser actions", () => {
  it("returns the safe Draft DTO on save success", async () => {
    mocks.saveContentDraft.mockResolvedValue(draft);

    await expect(saveContentDraftAction({})).resolves.toEqual({ ok: true, draft });
  });

  it("maps known application failures without exposing error details", async () => {
    mocks.saveContentDraft.mockRejectedValue(
      new ApplicationError("CONFLICT", "private conflict details"),
    );

    await expect(saveContentDraftAction({})).resolves.toEqual({ ok: false, code: "CONFLICT" });

    mocks.saveContentDraft.mockRejectedValue(new Error("database/sql/provider details"));
    await expect(saveContentDraftAction({})).resolves.toEqual({
      ok: false,
      code: "INTERNAL_ERROR",
    });
  });

  it("preserves the established safe rate-limit source mapping", async () => {
    mocks.saveContentDraft.mockRejectedValue(
      new ApplicationError("RATE_LIMITED", "private rate-limit details", {
        rateLimitSource: "workspace",
      }),
    );

    await expect(saveContentDraftAction({})).resolves.toEqual({
      ok: false,
      code: "RATE_LIMITED",
      rateLimitSource: "workspace",
    });
  });

  it("uses Ticket 07's Content-detail DTO for the editor read alias", async () => {
    const content = {
      id: "content-id",
      sourceIdea: { id: "idea-id", title: "Idea" },
      contentLanguage: "fa" as const,
      format: "SHORT_VIDEO" as const,
      draft,
    };
    mocks.getContentDraft.mockResolvedValue(content);

    await expect(getContentDraftAction({})).resolves.toEqual({ ok: true, content });
  });
});
