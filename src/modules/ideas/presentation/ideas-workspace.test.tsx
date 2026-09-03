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
    rateLimitSource: null,
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

  it("announces generation while the server action is pending and disables repeat input", async () => {
    let resolveGeneration!: (result: { ok: true }) => void;
    mocks.generate.mockReturnValueOnce(
      new Promise<{ ok: true }>((resolve) => {
        resolveGeneration = resolve;
      }),
    );
    const user = renderWorkspace();

    await user.click(screen.getByRole("button", { name: "Generate 20 Ideas" }));

    await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Generating ideas…" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("status").textContent).toContain("Generating ideas…");

    resolveGeneration({ ok: true });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
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

  it.each([
    { contentLanguage: "en" as const, locale: "en" as const },
    { contentLanguage: "fa" as const, locale: "en" as const },
    { contentLanguage: "en" as const, locale: "fa" as const },
    { contentLanguage: "fa" as const, locale: "fa" as const },
  ])(
    "keeps UI and generated content language presentation independent",
    ({ contentLanguage, locale }) => {
      const isPersianContent = contentLanguage === "fa";
      const content = isPersianContent
        ? { title: "ایدهٔ عنوان", description: "توضیح مفید برای ایده.", category: "منابع" }
        : { title: "Idea title", description: "A useful idea description.", category: "Education" };

      renderWorkspace({
        locale,
        currentDetail: detail({
          ideas: [
            idea(1, {
              title: content.title,
              description: content.description,
              category: content.category,
              language: contentLanguage,
            }),
          ],
        }),
      });

      const card = screen.getByText(content.title, { exact: true }).closest("article");
      if (!card) throw new Error("Idea card was not rendered.");

      const title = within(card).getByRole("heading", { name: content.title });
      const description = within(card).getByText(content.description, { exact: true });
      const categoryLabel = within(card).getByText(locale === "fa" ? "دسته‌بندی:" : "Category:", {
        exact: true,
      });
      const categoryValue = within(card).getByText(content.category, { exact: true });
      const contentClass = isPersianContent ? "font-content-persian" : "font-content-english";
      const contentDirection = isPersianContent ? "rtl" : "ltr";

      expect(title.getAttribute("lang")).toBe(contentLanguage);
      expect(title.getAttribute("dir")).toBe(contentDirection);
      expect(title.classList.contains(contentClass)).toBe(true);
      expect(description.getAttribute("lang")).toBe(contentLanguage);
      expect(description.getAttribute("dir")).toBe(contentDirection);
      expect(description.classList.contains(contentClass)).toBe(true);
      expect(categoryLabel.getAttribute("lang")).toBe(locale);
      expect(categoryLabel.getAttribute("dir")).toBe(locale === "fa" ? "rtl" : "ltr");
      expect(categoryLabel.classList.contains("font-sans")).toBe(true);
      expect(categoryValue.getAttribute("lang")).toBe(contentLanguage);
      expect(categoryValue.getAttribute("dir")).toBe(contentDirection);
      expect(categoryValue.classList.contains(contentClass)).toBe(true);
    },
  );

  it("represents REJECTED as the current decision without reopening rejection", async () => {
    const user = renderWorkspace({
      currentDetail: detail({
        ideas: [idea(1, { status: "REJECTED", rejectionReason: "Already covered" })],
      }),
    });
    const card = screen.getByText("Idea title 1").closest("article");

    if (!card) throw new Error("Idea card was not rendered.");
    const acceptButton = within(card).getByRole("button", { name: "Accept" });
    const saveButton = within(card).getByRole("button", { name: "Save for later" });
    const rejectButton = within(card).getByRole("button", { name: "Reject" });

    expect(rejectButton.getAttribute("aria-pressed")).toBe("true");
    expect(rejectButton.hasAttribute("disabled")).toBe(true);
    expect(acceptButton.getAttribute("aria-pressed")).toBe("false");
    expect(saveButton.getAttribute("aria-pressed")).toBe("false");
    expect(acceptButton.hasAttribute("disabled")).toBe(false);
    expect(saveButton.hasAttribute("disabled")).toBe(false);

    await user.click(rejectButton);

    expect(mocks.decision).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["ACCEPTED", "Accept"],
    ["SAVED", "Save for later"],
  ] as const)("represents %s as the current decision", (status, currentAction) => {
    renderWorkspace({ currentDetail: detail({ ideas: [idea(1, { status })] }) });
    const card = screen.getByText("Idea title 1").closest("article");

    if (!card) throw new Error("Idea card was not rendered.");
    const currentButton = within(card).getByRole("button", { name: currentAction });

    expect(currentButton.getAttribute("aria-pressed")).toBe("true");
    expect(currentButton.hasAttribute("disabled")).toBe(true);
  });

  it("leaves every decision action unselected for NEW ideas", () => {
    renderWorkspace({ currentDetail: detail({ ideas: [idea(1)] }) });
    const card = screen.getByText("Idea title 1").closest("article");

    if (!card) throw new Error("Idea card was not rendered.");
    for (const name of ["Accept", "Save for later", "Reject"]) {
      expect(within(card).getByRole("button", { name }).getAttribute("aria-pressed")).toBe("false");
    }
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

  it("keeps workspace and provider rate limits distinct and safe", async () => {
    const user = renderWorkspace({
      currentDetail: null,
      currentHistory: { batches: [], selectedBatchId: null },
    });
    mocks.generate.mockResolvedValueOnce({
      ok: false,
      code: "RATE_LIMITED",
      rateLimitSource: "workspace",
    });

    await user.click(screen.getByRole("button", { name: "Generate 20 Ideas" }));

    await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
    expect(
      screen.getByText(
        "No new batch was created. Wait for the workspace limit window to pass, then try again.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/recorded as a failed batch/)).toBeNull();

    cleanup();
    mocks.generate.mockClear();
    mocks.generate.mockResolvedValueOnce({
      ok: false,
      code: "RATE_LIMITED",
      rateLimitSource: "provider",
    });
    const providerUser = renderWorkspace({
      currentDetail: detail({
        status: "FAILED",
        errorCategory: "RATE_LIMITED",
        rateLimitSource: "provider",
        ideas: [],
        canRetry: true,
      }),
      currentHistory: {
        batches: [
          batch({
            status: "FAILED",
            errorCategory: "RATE_LIMITED",
            rateLimitSource: "provider",
            ideaCount: 0,
          }),
        ],
        selectedBatchId: batch().id,
      },
    });

    expect(screen.getByText(/recorded as a failed batch/)).toBeTruthy();
    expect(screen.queryByText(/workspace limit window/)).toBeNull();
    await providerUser.click(screen.getByRole("button", { name: "Generate 20 Ideas" }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
    expect(
      screen.getAllByText(/This generation attempt was recorded as a failed batch/),
    ).toHaveLength(2);
    expect(screen.queryByText(/No new batch was created/)).toBeNull();
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
