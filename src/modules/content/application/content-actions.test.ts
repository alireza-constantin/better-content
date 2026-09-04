import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  generateContentScript: vi.fn(),
  getContentDraft: vi.fn(),
  saveContentDraft: vi.fn(),
  retryContentGenerationAttempt: vi.fn(),
}));

vi.mock("./content-application", () => ({
  getContentDetail: vi.fn(),
  getContentDraft: mocks.getContentDraft,
  getContentGenerationAttemptDetail: vi.fn(),
  getContentGenerationAttemptResult: vi.fn(),
  getIdeaContentGenerationHistory: vi.fn(),
  getIdeaContentUsage: vi.fn(),
  listContent: vi.fn(),
  generateContentScript: mocks.generateContentScript,
  retryContentGenerationAttempt: mocks.retryContentGenerationAttempt,
  saveContentDraft: mocks.saveContentDraft,
}));

import {
  generateContentScriptAction,
  getContentDraftAction,
  retryContentGenerationAttemptAction,
  saveContentDraftAction,
} from "./content-actions";

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

describe("Content Script generation browser actions", () => {
  it("returns only a real resulting Content ID on success", async () => {
    mocks.generateContentScript.mockResolvedValue({
      attempt: { id: "attempt-id" },
      contentId: "content-id",
      replayed: false,
    });

    await expect(generateContentScriptAction({ request: "safe" })).resolves.toEqual({
      ok: true,
      contentId: "content-id",
    });
  });

  it("does not report success when atomic completion has no resulting Content", async () => {
    mocks.generateContentScript.mockResolvedValue({
      attempt: { id: "attempt-id" },
      contentId: null,
      replayed: false,
    });

    await expect(generateContentScriptAction({})).resolves.toEqual({
      ok: false,
      code: "INTERNAL_ERROR",
    });
  });

  it("keeps safe validation and source-specific rate-limit failures", async () => {
    mocks.generateContentScript.mockRejectedValue(
      new ApplicationError("VALIDATION_ERROR", "private validation details"),
    );
    await expect(generateContentScriptAction({})).resolves.toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });

    mocks.generateContentScript.mockRejectedValue(
      new ApplicationError("RATE_LIMITED", "workspace quota details", {
        rateLimitSource: "workspace",
      }),
    );
    await expect(generateContentScriptAction({})).resolves.toEqual({
      ok: false,
      code: "RATE_LIMITED",
      rateLimitSource: "workspace",
    });

    mocks.generateContentScript.mockRejectedValue(
      new ApplicationError("RATE_LIMITED", "provider details", {
        rateLimitSource: "provider",
      }),
    );
    await expect(generateContentScriptAction({})).resolves.toEqual({
      ok: false,
      code: "RATE_LIMITED",
      rateLimitSource: "provider",
    });
  });

  it("uses the existing retry application path and requires its resulting Content ID", async () => {
    const attempt = {
      id: "attempt-id",
      status: "COMPLETED" as const,
      errorCategory: null,
      rateLimitSource: null,
      requestedLanguage: "en" as const,
      format: "SHORT_VIDEO" as const,
      createdAt: new Date("2026-09-01T10:00:00.000Z"),
      startedAt: new Date("2026-09-01T10:00:01.000Z"),
      completedAt: new Date("2026-09-01T10:00:02.000Z"),
      failedAt: null,
    };
    mocks.retryContentGenerationAttempt.mockResolvedValue({
      attempt,
      contentId: "content-id",
      replayed: false,
    });

    await expect(retryContentGenerationAttemptAction({ attemptId: "attempt-id" })).resolves.toEqual(
      {
        ok: true,
        attempt,
        contentId: "content-id",
      },
    );
    expect(mocks.retryContentGenerationAttempt).toHaveBeenCalledWith({ attemptId: "attempt-id" });

    mocks.retryContentGenerationAttempt.mockResolvedValue({
      attempt,
      contentId: null,
      replayed: false,
    });
    await expect(retryContentGenerationAttemptAction({})).resolves.toEqual({
      ok: false,
      code: "INTERNAL_ERROR",
    });
  });
});
