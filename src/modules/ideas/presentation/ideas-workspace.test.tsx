// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import type {
  IdeaGenerationBatchDetailDto,
  IdeaGenerationBatchHistoryDto,
  IdeaGenerationBatchHistoryResult,
} from "@/modules/ideas/application";
import type { IdeaDto } from "@/modules/ideas/application";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  retry: vi.fn(),
  decision: vi.fn(),
  refresh: vi.fn(),
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
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { IdeasWorkspace } from "./ideas-workspace";
import type { IdeasDnaSummary } from "./ideas-types";

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

const workspaceId = "11111111-1111-4111-8111-111111111111";
const dnaVersionId = "22222222-2222-4222-8222-222222222222";
const firstIdeaId = "33333333-3333-4333-8333-333333333333";

function dna(overrides: Partial<IdeasDnaSummary> = {}): IdeasDnaSummary {
  return {
    status: "AI_READY",
    currentVersion: {
      id: dnaVersionId,
      versionNumber: 3,
      defaultContentLanguage: "en",
      contentLanguages: ["en", "fa"],
    },
    ...overrides,
  };
}

function idea(position: number, overrides: Partial<IdeaDto> = {}): IdeaDto {
  return {
    id: position === 1 ? firstIdeaId : `idea-${position}`,
    batchId: "44444444-4444-4444-8444-444444444444",
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
    ...overrides,
  };
}

function batch(
  overrides: Partial<IdeaGenerationBatchHistoryDto> = {},
): IdeaGenerationBatchHistoryDto {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    contentDnaVersionId: dnaVersionId,
    contentDnaVersionNumber: 3,
    requestedLanguage: "en",
    requestedCount: 20,
    status: "COMPLETED",
    errorCategory: null,
    ideaCount: 20,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    startedAt: new Date("2026-09-01T10:00:01Z"),
    completedAt: new Date("2026-09-01T10:00:10Z"),
    failedAt: null,
    ...overrides,
  };
}

function detail(
  overrides: Partial<IdeaGenerationBatchDetailDto> = {},
): IdeaGenerationBatchDetailDto {
  return {
    ...batch(),
    ideas: Array.from({ length: 20 }, (_, index) => idea(index + 1)),
    canRetry: false,
    ...overrides,
  };
}

function renderWorkspace({
  locale = "en",
  currentDna = dna(),
  currentDetail = detail(),
  currentHistory = { batches: [batch()], selectedBatchId: batch().id },
}: Readonly<{
  locale?: "en" | "fa";
  currentDna?: IdeasDnaSummary;
  currentDetail?: IdeaGenerationBatchDetailDto | null;
  currentHistory?: IdeaGenerationBatchHistoryResult;
}> = {}) {
  const user = userEvent.setup();

  render(
    <NextIntlClientProvider locale={locale} messages={locale === "fa" ? fa : en}>
      <IdeasWorkspace
        dna={currentDna}
        initialDetail={currentDetail}
        initialHistory={currentHistory}
        workspaceId={workspaceId}
      />
    </NextIntlClientProvider>,
  );

  return user;
}

describe("Ideas workspace presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockResolvedValue({ ok: true });
    mocks.retry.mockResolvedValue({ ok: true });
  });

  afterEach(cleanup);

  it("guides a workspace without Content DNA back to setup", () => {
    renderWorkspace({
      currentDna: { status: "NOT_CREATED", currentVersion: null },
      currentDetail: null,
      currentHistory: { batches: [], selectedBatchId: null },
    });

    expect(screen.getByRole("heading", { name: "Set up Content DNA first" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Content DNA" }).getAttribute("href")).toBe(
      "/content-dna",
    );
    expect(screen.queryByRole("button", { name: "Generate 20 Ideas" })).toBeNull();
  });

  it("renders exactly 20 completed ideas and defaults to the DNA language", () => {
    renderWorkspace();

    expect(screen.getByRole("button", { name: "Generate 20 Ideas" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Idea language" }).textContent).toContain(
      "English",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(21);
    expect(screen.getByText("Idea title 20")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Generated ideas" })).toBeTruthy();
  });

  it("submits only the safe generation identity and refreshes after completion", async () => {
    const user = renderWorkspace();

    await user.click(screen.getByRole("button", { name: "Generate 20 Ideas" }));

    await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
    expect(mocks.generate.mock.calls[0]?.[0]).toMatchObject({
      workspaceId,
      baseContentDnaVersionId: dnaVersionId,
      requestedLanguage: "en",
    });
    expect(mocks.generate.mock.calls[0]?.[0]).not.toHaveProperty("requestedCount");
    expect(mocks.generate.mock.calls[0]?.[0]).not.toHaveProperty("locale");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("updates an individual decision without changing generated text", async () => {
    const updated = idea(1, { status: "SAVED" });
    mocks.decision.mockResolvedValue({ ok: true, idea: updated });
    const user = renderWorkspace();
    const card = screen.getByText("Idea title 1").closest("article");

    if (!card) throw new Error("Idea card was not rendered.");
    await user.click(within(card).getByRole("button", { name: "Save for later" }));

    await waitFor(() => expect(mocks.decision).toHaveBeenCalledOnce());
    expect(mocks.decision.mock.calls[0]?.[0]).toMatchObject({
      workspaceId,
      ideaId: firstIdeaId,
      nextState: "SAVED",
    });
    expect(within(card).getByText("Saved for later")).toBeTruthy();
    expect(within(card).getByText("Idea title 1")).toBeTruthy();
  });

  it("opens an accessible optional rejection form, submits a blank reason, and restores focus", async () => {
    const updated = idea(1, { status: "REJECTED" });
    mocks.decision.mockResolvedValue({ ok: true, idea: updated });
    const user = renderWorkspace();
    const card = screen.getByText("Idea title 1").closest("article");

    if (!card) throw new Error("Idea card was not rendered.");
    const rejectButton = within(card).getByRole("button", { name: "Reject" });
    await user.click(rejectButton);

    expect(screen.getByRole("dialog", { name: "Reject this idea" })).toBeTruthy();
    const reason = screen.getByLabelText("Reason (optional)");
    expect(reason).toBe(document.activeElement);
    await user.click(screen.getByRole("button", { name: "Reject idea" }));

    await waitFor(() => expect(mocks.decision).toHaveBeenCalledOnce());
    expect(mocks.decision.mock.calls[0]?.[0]).toMatchObject({
      workspaceId,
      ideaId: firstIdeaId,
      nextState: "REJECTED",
      rejectionReason: null,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(rejectButton));
  });

  it("localizes the rejection length error and keeps the dialog open", async () => {
    const user = renderWorkspace();
    const card = screen.getByText("Idea title 1").closest("article");

    if (!card) throw new Error("Idea card was not rendered.");
    await user.click(within(card).getByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByLabelText("Reason (optional)"), {
      target: { value: "x".repeat(501) },
    });
    await user.click(screen.getByRole("button", { name: "Reject idea" }));

    expect(await screen.findByText("Use no more than 500 characters.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Reject this idea" })).toBeTruthy();
    expect(mocks.decision).not.toHaveBeenCalled();
  });

  it("keeps active and failed batch states explicit", () => {
    renderWorkspace({
      currentDetail: detail({ status: "RUNNING", ideas: [], canRetry: false }),
      currentHistory: {
        batches: [batch({ status: "RUNNING", ideaCount: 0 })],
        selectedBatchId: batch().id,
      },
    });
    expect(screen.getAllByText("Your ideas are on their way")).toHaveLength(2);
    expect(screen.getByText(/The request is being processed\./)).toBeTruthy();
    cleanup();

    renderWorkspace({
      currentDetail: detail({
        status: "FAILED",
        errorCategory: "PROVIDER_UNAVAILABLE",
        ideas: [],
        canRetry: true,
      }),
      currentHistory: {
        batches: [batch({ status: "FAILED", errorCategory: "PROVIDER_UNAVAILABLE", ideaCount: 0 })],
        selectedBatchId: batch().id,
      },
    });
    expect(screen.getByText(/The idea provider was unavailable\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry generation" })).toBeTruthy();
  });

  it("renders the same content decisions under Persian RTL", () => {
    renderWorkspace({ locale: "fa" });

    expect(
      screen.getByRole("heading", { name: "برای محتوای بعدی‌تان شروعی قوی‌تر بسازید." }),
    ).toBeTruthy();
    expect(screen.getByRole("list", { name: "ایده‌های تولیدشده" })).toBeTruthy();
    expect(screen.getByText("Idea title 1")).toBeTruthy();
    expect(screen.getByText("Idea title 1").closest("div[dir=rtl]")).toBeTruthy();
  });
});
