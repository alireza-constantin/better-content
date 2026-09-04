// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import type {
  IdeaGenerationBatchHistoryDto,
  IdeaGenerationBatchHistoryResult,
  IdeaLibraryDto,
  IdeaLibraryItemDto,
} from "@/modules/ideas/application";

const mocks = vi.hoisted(() => ({
  decision: vi.fn(),
  generate: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  retry: vi.fn(),
}));

vi.mock("../application/ideas-actions", () => ({
  generateIdeasAction: mocks.generate,
  retryIdeaGenerationAction: mocks.retry,
  updateIdeaDecisionAction: mocks.decision,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

import { IdeasWorkspace } from "./ideas-workspace";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const batchOneId = "33333333-3333-4333-8333-333333333333";
const batchTwoId = "44444444-4444-4444-8444-444444444444";

function batch(
  overrides: Partial<IdeaGenerationBatchHistoryDto> = {},
): IdeaGenerationBatchHistoryDto {
  return {
    id: batchOneId,
    contentDnaVersionId: versionId,
    contentDnaVersionNumber: 3,
    requestedLanguage: "en",
    requestedCount: 20,
    status: "COMPLETED",
    errorCategory: null,
    rateLimitSource: null,
    ideaCount: 20,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    startedAt: new Date("2026-09-01T10:00:01Z"),
    completedAt: new Date("2026-09-01T10:00:10Z"),
    failedAt: null,
    ...overrides,
  };
}

function libraryIdea(
  position: number,
  overrides: Partial<IdeaLibraryItemDto> = {},
): IdeaLibraryItemDto {
  const sourceBatchId = overrides.batch?.id ?? batchOneId;

  return {
    id: `55555555-5555-4555-8555-${String(position).padStart(12, "0")}`,
    batchId: sourceBatchId,
    position,
    title: `Idea title ${position}`,
    description: `A useful description for idea ${position}.`,
    category: "Education",
    language: "en",
    status: "NEW",
    rejectionReason: null,
    statusChangedAt: new Date("2026-09-01T10:00:00Z"),
    createdAt: new Date("2026-09-01T10:00:00Z"),
    updatedAt: new Date("2026-09-01T10:00:00Z"),
    contentCount: 0,
    batch: {
      id: sourceBatchId,
      contentDnaVersionNumber: 3,
      requestedLanguage: "en",
      status: "COMPLETED",
      createdAt: new Date("2026-09-01T10:00:00Z"),
    },
    ...overrides,
  };
}

function library(overrides: Partial<IdeaLibraryDto> = {}): IdeaLibraryDto {
  return {
    statusFilter: "NEW",
    generationBatchId: null,
    ideas: [libraryIdea(1)],
    ...overrides,
  };
}

const dna = {
  status: "AI_READY" as const,
  currentVersion: {
    id: versionId,
    versionNumber: 3,
    defaultContentLanguage: "en" as const,
    contentLanguages: ["en", "fa"] as const,
  },
};

function renderWorkspace(
  options: Readonly<{
    locale?: "en" | "fa";
    currentLibrary?: IdeaLibraryDto;
    currentHistory?: IdeaGenerationBatchHistoryResult;
  }> = {},
) {
  const locale = options.locale ?? "en";
  const history = options.currentHistory ?? {
    batches: [batch(), batch({ id: batchTwoId, contentDnaVersionNumber: 2 })],
    selectedBatchId: batchOneId,
  };

  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "fa" ? fa : en}>
      <IdeasWorkspace
        dna={dna}
        initialHistory={history}
        initialLibrary={options.currentLibrary ?? library()}
        workspaceId={workspaceId}
      />
    </NextIntlClientProvider>,
  );
}

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.decision.mockResolvedValue({ ok: true, idea: libraryIdea(1, { status: "SAVED" }) });
});

afterEach(cleanup);

describe("Ideas Workspace Library presentation", () => {
  it("presents New plus All runs as an understandable default filter intersection", () => {
    renderWorkspace();

    expect(screen.getByRole("link", { name: "New" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "All runs" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("heading", { name: "Ideas" })).toBeTruthy();
    expect(screen.getByText("Idea title 1")).toBeTruthy();
  });

  it("preserves a selected run while switching status and preserves status while clearing it", () => {
    renderWorkspace({
      currentLibrary: library({ statusFilter: "SAVED", generationBatchId: batchOneId }),
    });

    expect(screen.getByRole("link", { name: "Accepted" }).getAttribute("href")).toBe(
      `/ideas?view=accepted&batchId=${batchOneId}`,
    );
    expect(screen.getByRole("link", { name: "All runs" }).getAttribute("href")).toBe(
      "/ideas?view=saved",
    );
  });

  it("renders all run choices inside the same Library filter area without raw IDs", () => {
    renderWorkspace();

    const filters = screen.getByLabelText("Idea Library filters");
    expect(within(filters).getByText("Past Runs")).toBeTruthy();
    expect(within(filters).getAllByText(/DNA version/)).toHaveLength(2);
    expect(filters.textContent).not.toContain(batchOneId);
  });

  it("refreshes authoritative filtered data after a decision instead of changing the list locally", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const card = screen.getByRole("article");

    await user.click(within(card).getByRole("button", { name: "Save for later" }));

    expect(mocks.decision).toHaveBeenCalledWith({
      workspaceId,
      ideaId: libraryIdea(1).id,
      nextState: "SAVED",
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows derived zero, one, and multiple Content counts only for accepted Ideas", () => {
    renderWorkspace({
      currentLibrary: library({
        statusFilter: "ALL",
        ideas: [
          libraryIdea(1, { status: "ACCEPTED", contentCount: 0 }),
          libraryIdea(2, { status: "ACCEPTED", contentCount: 1 }),
          libraryIdea(3, { status: "ACCEPTED", contentCount: 2 }),
          libraryIdea(4, { status: "SAVED", contentCount: 3 }),
        ],
      }),
    });

    expect(screen.getByText("In content queue")).toBeTruthy();
    expect(screen.getByText("1 Content")).toBeTruthy();
    expect(screen.getByText("2 Contents")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Generate Script" })).toBeNull();
    expect(screen.queryByText(/Attempts/)).toBeNull();
  });

  it("uses Persian direction while preserving mixed Idea text without transformation", () => {
    renderWorkspace({
      locale: "fa",
      currentLibrary: library({
        ideas: [
          libraryIdea(1, {
            language: "fa",
            title: "راهنمای English برای سازنده",
            description: "Mixed English — توضیح فارسی",
          }),
        ],
      }),
    });

    expect(screen.getByText("راهنمای English برای سازنده").getAttribute("dir")).toBe("rtl");
    expect(screen.getByLabelText("فیلترهای کتابخانهٔ ایده")).toBeTruthy();
  });
});
