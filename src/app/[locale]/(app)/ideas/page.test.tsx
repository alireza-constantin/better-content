// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentContentDna: vi.fn(),
  getIdeaContentGenerationHistory: vi.fn(),
  getIdeaGenerationBatchHistory: vi.fn(),
  getIdeaLibrary: vi.fn(),
  getOrCreateDefaultWorkspace: vi.fn(),
  getServerSession: vi.fn(),
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
vi.mock("@/modules/content/application", () => ({
  getIdeaContentGenerationHistory: mocks.getIdeaContentGenerationHistory,
}));
vi.mock("@/modules/ideas/application", () => ({
  getIdeaGenerationBatchHistory: mocks.getIdeaGenerationBatchHistory,
  getIdeaLibrary: mocks.getIdeaLibrary,
}));
vi.mock("@/modules/ideas/presentation/ideas-workspace", () => ({
  IdeasWorkspace: (props: {
    initialLibrary: { generationBatchId: string | null; statusFilter: string; ideas: unknown[] };
  }) => (
    <div
      data-batch-id={props.initialLibrary.generationBatchId ?? "all"}
      data-count={props.initialLibrary.ideas.length}
      data-status={props.initialLibrary.statusFilter}
      data-testid="ideas-workspace"
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
      payload: {
        schemaVersion: 1,
        language: { defaultContentLanguage: "fa", contentLanguages: ["en", "fa"] },
      },
    },
  });
  mocks.getIdeaGenerationBatchHistory.mockResolvedValue({ batches: [], selectedBatchId: null });
  mocks.getIdeaLibrary.mockResolvedValue({
    statusFilter: "NEW",
    generationBatchId: null,
    ideas: [],
  });
  mocks.getIdeaContentGenerationHistory.mockResolvedValue({
    sourceIdea: { id: "accepted-idea", title: "Accepted idea" },
    isUsed: false,
    attempts: [],
  });
});

afterEach(cleanup);

describe("Ideas route", () => {
  it("defaults /ideas to New plus All runs", async () => {
    const result = await IdeasPage({ searchParams: Promise.resolve({}) });
    render(result);

    expect(mocks.getIdeaLibrary).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      statusFilter: "NEW",
      generationBatchId: null,
    });
    expect(screen.getByTestId("ideas-workspace").getAttribute("data-status")).toBe("NEW");
    expect(screen.getByTestId("ideas-workspace").getAttribute("data-batch-id")).toBe("all");
  });

  it("passes direct status and selected-run state to the authorized Library read", async () => {
    mocks.getIdeaLibrary.mockResolvedValue({
      statusFilter: "SAVED",
      generationBatchId: "batch-1",
      ideas: [],
    });

    const result = await IdeasPage({
      searchParams: Promise.resolve({ view: "saved", batchId: "batch-1" }),
    });
    render(result);

    expect(mocks.getIdeaLibrary).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      statusFilter: "SAVED",
      generationBatchId: "batch-1",
    });
    expect(screen.getByTestId("ideas-workspace").getAttribute("data-batch-id")).toBe("batch-1");
  });

  it("normalizes an unsupported view to New while leaving batch authorization to the read boundary", async () => {
    await IdeasPage({ searchParams: Promise.resolve({ view: "unexpected", batchId: "foreign" }) });

    expect(mocks.getIdeaLibrary).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      statusFilter: "NEW",
      generationBatchId: "foreign",
    });
  });

  it("loads Ticket 09 Attempt history only for accepted Ideas in the selected Library result", async () => {
    mocks.getIdeaLibrary.mockResolvedValue({
      statusFilter: "ACCEPTED",
      generationBatchId: null,
      ideas: [
        { id: "accepted-idea", status: "ACCEPTED" },
        { id: "saved-idea", status: "SAVED" },
      ],
    });

    await IdeasPage({ searchParams: Promise.resolve({ view: "accepted" }) });

    expect(mocks.getIdeaContentGenerationHistory).toHaveBeenCalledOnce();
    expect(mocks.getIdeaContentGenerationHistory).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      sourceIdeaId: "accepted-idea",
    });
  });

  it("does not provision or query private data without a session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    await expect(IdeasPage({ searchParams: Promise.resolve({}) })).resolves.toBeNull();

    expect(mocks.getOrCreateDefaultWorkspace).not.toHaveBeenCalled();
    expect(mocks.getIdeaLibrary).not.toHaveBeenCalled();
  });
});
