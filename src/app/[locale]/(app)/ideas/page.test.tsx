// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getOrCreateDefaultWorkspace: vi.fn(),
  getCurrentContentDna: vi.fn(),
  getIdeaGenerationBatchHistory: vi.fn(),
  getIdeaGenerationBatch: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/auth/server", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/modules/workspace/application", () => ({
  getOrCreateDefaultWorkspace: mocks.getOrCreateDefaultWorkspace,
}));
vi.mock("@/modules/dna/application", () => ({
  getCurrentContentDna: mocks.getCurrentContentDna,
}));
vi.mock("@/modules/ideas/application", () => ({
  getIdeaGenerationBatchHistory: mocks.getIdeaGenerationBatchHistory,
  getIdeaGenerationBatch: mocks.getIdeaGenerationBatch,
}));
vi.mock("@/modules/ideas/presentation/ideas-workspace", () => ({
  IdeasWorkspace: (props: { workspaceId: string; initialDetail: unknown }) => (
    <div
      data-detail={props.initialDetail ? "loaded" : "empty"}
      data-testid="ideas-workspace"
      data-workspace={props.workspaceId}
    />
  ),
}));

import IdeasPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.getOrCreateDefaultWorkspace.mockResolvedValue({ id: "workspace-1" });
  mocks.getCurrentContentDna.mockResolvedValue({
    status: "AI_READY",
    currentVersion: {
      id: "version-1",
      versionNumber: 2,
      readiness: "AI_READY",
      createdAt: new Date(),
      isCurrent: true,
      payload: {
        schemaVersion: 1,
        language: { defaultContentLanguage: "fa", contentLanguages: ["en", "fa"] },
      },
    },
  });
  mocks.getIdeaGenerationBatchHistory.mockResolvedValue({
    batches: [{ id: "batch-1" }],
    selectedBatchId: "batch-1",
  });
  mocks.getIdeaGenerationBatch.mockResolvedValue({ id: "batch-1" });
});

afterEach(cleanup);

describe("Ideas route", () => {
  it("loads authorized workspace data and selects a requested batch from safe history", async () => {
    const result = await IdeasPage({
      searchParams: Promise.resolve({ batchId: "batch-1" }),
    });
    render(result);

    expect(mocks.getCurrentContentDna).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
    expect(mocks.getIdeaGenerationBatchHistory).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    });
    expect(mocks.getIdeaGenerationBatch).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      batchId: "batch-1",
    });
    expect(screen.getByTestId("ideas-workspace").getAttribute("data-detail")).toBe("loaded");
    expect(screen.getByTestId("ideas-workspace").getAttribute("data-workspace")).toBe(
      "workspace-1",
    );
  });

  it("does not provision or query private data without a session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    await expect(IdeasPage({ searchParams: Promise.resolve({}) })).resolves.toBeNull();

    expect(mocks.getOrCreateDefaultWorkspace).not.toHaveBeenCalled();
    expect(mocks.getIdeaGenerationBatchHistory).not.toHaveBeenCalled();
  });
});
