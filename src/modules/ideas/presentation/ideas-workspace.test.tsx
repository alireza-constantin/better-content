// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import type {
  ContentGenerationAttemptHistoryDto,
  IdeaContentGenerationHistoryDto,
} from "@/modules/content/application/content-read-service";
import type {
  IdeaGenerationBatchDetailDto,
  IdeaGenerationBatchHistoryDto,
  IdeaGenerationBatchHistoryResult,
} from "@/modules/ideas/application";
import type { IdeaDto } from "@/modules/ideas/application";

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  generate: vi.fn(),
  retry: vi.fn(),
  retryContent: vi.fn(),
  decision: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/modules/content/application/content-actions", () => ({
  generateContentScriptAction: mocks.generateContent,
  retryContentGenerationAttemptAction: mocks.retryContent,
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
import type { IdeasDnaSummary } from "./ideas-types";

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
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

function contentAttempt(
  overrides: Partial<ContentGenerationAttemptHistoryDto> = {},
): ContentGenerationAttemptHistoryDto {
  return {
    id: "content-attempt-1",
    status: "FAILED",
    errorCategory: "PROVIDER_UNAVAILABLE",
    rateLimitSource: null,
    requestedLanguage: "en",
    format: "SHORT_VIDEO",
    instructions: "Keep the opening direct. مرحباً",
    createdAt: new Date("2026-09-01T10:02:00Z"),
    startedAt: new Date("2026-09-01T10:02:01Z"),
    completedAt: null,
    failedAt: new Date("2026-09-01T10:02:05Z"),
    resultingContentId: null,
    ...overrides,
  };
}

function contentHistory(
  attempts: readonly ContentGenerationAttemptHistoryDto[],
  overrides: Partial<IdeaContentGenerationHistoryDto> = {},
): IdeaContentGenerationHistoryDto {
  return {
    sourceIdea: { id: firstIdeaId, title: "Idea title 1" },
    isUsed: attempts.some((attempt) => attempt.status === "COMPLETED"),
    attempts,
    ...overrides,
  };
}

function renderWorkspace({
  locale = "en",
  currentDna = dna(),
  currentDetail = detail(),
  currentHistory = { batches: [batch()], selectedBatchId: batch().id },
  currentContentGenerationHistory = {},
}: Readonly<{
  locale?: "en" | "fa";
  currentDna?: IdeasDnaSummary;
  currentDetail?: IdeaGenerationBatchDetailDto | null;
  currentHistory?: IdeaGenerationBatchHistoryResult;
  currentContentGenerationHistory?: Readonly<Record<string, IdeaContentGenerationHistoryDto>>;
}> = {}) {
  const user = userEvent.setup();

  render(
    <NextIntlClientProvider locale={locale} messages={locale === "fa" ? fa : en}>
      <IdeasWorkspace
        dna={currentDna}
        contentGenerationHistory={currentContentGenerationHistory}
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
    mocks.generateContent.mockResolvedValue({ ok: true, contentId: "content-id" });
    mocks.retryContent.mockResolvedValue({ ok: true, contentId: "retry-content-id" });
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

  it("lets a rejected idea reopen its rejection dialog with the existing reason", async () => {
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
    expect(rejectButton.hasAttribute("disabled")).toBe(false);
    expect(acceptButton.getAttribute("aria-pressed")).toBe("false");
    expect(saveButton.getAttribute("aria-pressed")).toBe("false");
    expect(acceptButton.hasAttribute("disabled")).toBe(false);
    expect(saveButton.hasAttribute("disabled")).toBe(false);

    await user.click(rejectButton);

    expect(mocks.decision).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Reject this idea" })).toBeTruthy();
    expect((screen.getByLabelText("Reason (optional)") as HTMLTextAreaElement).value).toBe(
      "Already covered",
    );
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

  it.each(["NEW", "SAVED", "REJECTED"] as const)(
    "does not expose Script generation for %s ideas",
    (status) => {
      renderWorkspace({ currentDetail: detail({ ideas: [idea(1, { status })] }) });

      const card = screen.getByText("Idea title 1").closest("article");
      if (!card) throw new Error("Idea card was not rendered.");

      expect(within(card).queryByRole("button", { name: "Generate Script" })).toBeNull();
    },
  );

  it("only exposes Script generation for accepted ideas, including an idea with existing Content", () => {
    renderWorkspace({
      currentDetail: detail({ ideas: [idea(1, { status: "ACCEPTED" })] }),
      currentContentGenerationHistory: {
        [firstIdeaId]: contentHistory([
          contentAttempt({
            status: "COMPLETED",
            errorCategory: null,
            completedAt: new Date("2026-09-01T10:02:05Z"),
            failedAt: null,
            resultingContentId: "55555555-5555-4555-8555-555555555555",
          }),
        ]),
      },
    });

    const card = screen.getByText("Idea title 1").closest("article");
    if (!card) throw new Error("Idea card was not rendered.");

    expect(
      within(card).getByRole("button", { name: "Generate Script" }).hasAttribute("disabled"),
    ).toBe(false);
    expect(within(card).getByRole("heading", { name: "Script generation history" })).toBeTruthy();
    expect(
      within(card).getByRole("link", { name: "Open generated Content" }).getAttribute("href"),
    ).toBe("/content/55555555-5555-4555-8555-555555555555");
  });

  it("renders exactly the three approved Script form fields and defaults to current DNA language", async () => {
    const user = renderWorkspace({
      currentDna: dna({
        currentVersion: {
          ...dna().currentVersion!,
          defaultContentLanguage: "fa",
        },
      }),
      currentDetail: detail({ ideas: [idea(1, { status: "ACCEPTED" })] }),
    });
    const card = screen.getByText("Idea title 1").closest("article");
    if (!card) throw new Error("Idea card was not rendered.");

    await user.click(within(card).getByRole("button", { name: "Generate Script" }));
    const dialog = await screen.findByRole("dialog", { name: "Generate a Script" });

    expect(within(dialog).getAllByRole("combobox")).toHaveLength(2);
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(1);
    expect(
      within(dialog).getByRole("combobox", { name: "Requested language" }).textContent,
    ).toContain("Persian");
    expect(within(dialog).getByRole("combobox", { name: "Format" }).textContent).toContain(
      "Short video",
    );
    expect(within(dialog).queryByLabelText(/provider|model|prompt|token|temperature/i)).toBeNull();

    await user.click(within(dialog).getByRole("combobox", { name: "Format" }));
    expect(screen.getByRole("option", { name: "Long video" })).toBeTruthy();
    await user.click(screen.getByRole("option", { name: "Long video" }));
    expect(within(dialog).getByRole("combobox", { name: "Format" }).textContent).toContain(
      "Long video",
    );
  });

  it("enforces the 1,000-character instructions boundary before the action", async () => {
    const user = renderWorkspace({
      currentDetail: detail({ ideas: [idea(1, { status: "ACCEPTED" })] }),
    });
    const card = screen.getByText("Idea title 1").closest("article");
    if (!card) throw new Error("Idea card was not rendered.");
    await user.click(within(card).getByRole("button", { name: "Generate Script" }));
    const dialog = await screen.findByRole("dialog", { name: "Generate a Script" });
    const instructions = within(dialog).getByLabelText("Instructions (optional)");

    fireEvent.change(instructions, { target: { value: "x".repeat(1_000) } });
    await waitFor(() => expect(within(dialog).getByText("1000/1,000 characters")).toBeTruthy());
    await user.click(within(dialog).getByRole("button", { name: "Generate Script" }));
    await waitFor(() => expect(mocks.generateContent).toHaveBeenCalledOnce());

    cleanup();
    mocks.generateContent.mockClear();
    const retryUser = renderWorkspace({
      currentDetail: detail({ ideas: [idea(1, { status: "ACCEPTED" })] }),
    });
    const retryCard = screen.getByText("Idea title 1").closest("article");
    if (!retryCard) throw new Error("Idea card was not rendered.");
    await retryUser.click(within(retryCard).getByRole("button", { name: "Generate Script" }));
    const retryDialog = await screen.findByRole("dialog", { name: "Generate a Script" });
    fireEvent.change(within(retryDialog).getByLabelText("Instructions (optional)"), {
      target: { value: "x".repeat(1_001) },
    });
    await retryUser.click(within(retryDialog).getByRole("button", { name: "Generate Script" }));

    expect(await within(retryDialog).findByText("Use no more than 1,000 characters.")).toBeTruthy();
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("uses a fresh idempotency key for each new submit and protects the synchronous request", async () => {
    mocks.generateContent
      .mockResolvedValueOnce({ ok: false, code: "VALIDATION_ERROR" })
      .mockResolvedValueOnce({ ok: true, contentId: "66666666-6666-4666-8666-666666666666" });
    const user = renderWorkspace({
      currentDetail: detail({ ideas: [idea(1, { status: "ACCEPTED" })] }),
    });
    const card = screen.getByText("Idea title 1").closest("article");
    if (!card) throw new Error("Idea card was not rendered.");
    await user.click(within(card).getByRole("button", { name: "Generate Script" }));
    const dialog = await screen.findByRole("dialog", { name: "Generate a Script" });
    const submit = within(dialog).getByRole("button", { name: "Generate Script" });

    await user.click(submit);
    await waitFor(() => expect(mocks.generateContent).toHaveBeenCalledOnce());
    await user.click(within(dialog).getByRole("button", { name: "Generate Script" }));
    await waitFor(() => expect(mocks.generateContent).toHaveBeenCalledTimes(2));

    const firstKey = mocks.generateContent.mock.calls[0]?.[0].idempotencyKey;
    const secondKey = mocks.generateContent.mock.calls[1]?.[0].idempotencyKey;
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(firstKey).not.toBe(secondKey);
    expect(mocks.push).toHaveBeenCalledWith("/content/66666666-6666-4666-8666-666666666666");

    mocks.generateContent.mockClear();
    mocks.push.mockClear();
    let resolveGeneration!: (result: { ok: true; contentId: string }) => void;
    mocks.generateContent.mockReturnValueOnce(
      new Promise<{ ok: true; contentId: string }>((resolve) => {
        resolveGeneration = resolve;
      }),
    );
    cleanup();
    const pendingUser = renderWorkspace({
      currentDetail: detail({ ideas: [idea(1, { status: "ACCEPTED" })] }),
    });
    const pendingCard = screen.getByText("Idea title 1").closest("article");
    if (!pendingCard) throw new Error("Idea card was not rendered.");
    await pendingUser.click(within(pendingCard).getByRole("button", { name: "Generate Script" }));
    const pendingDialog = await screen.findByRole("dialog", { name: "Generate a Script" });
    await pendingUser.click(within(pendingDialog).getByRole("button", { name: "Generate Script" }));
    await waitFor(() => expect(mocks.generateContent).toHaveBeenCalledTimes(1));
    expect(within(pendingDialog).getByRole("status").textContent).toContain("Generating Script…");
    expect(
      within(pendingDialog)
        .getByRole("button", { name: "Generating Script…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await pendingUser.click(
      within(pendingDialog).getByRole("button", { name: "Generating Script…" }),
    );
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    resolveGeneration({ ok: true, contentId: "77777777-7777-4777-8777-777777777777" });
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/content/77777777-7777-4777-8777-777777777777"),
    );
  });

  it("does not navigate without a resulting Content ID", async () => {
    mocks.generateContent.mockResolvedValueOnce({ ok: true, contentId: null });
    const user = renderWorkspace({
      currentDetail: detail({ ideas: [idea(1, { status: "ACCEPTED" })] }),
    });
    const card = screen.getByText("Idea title 1").closest("article");
    if (!card) throw new Error("Idea card was not rendered.");
    await user.click(within(card).getByRole("button", { name: "Generate Script" }));
    const dialog = await screen.findByRole("dialog", { name: "Generate a Script" });
    await user.click(within(dialog).getByRole("button", { name: "Generate Script" }));

    expect(
      await within(dialog).findByText("Script generation could not be completed"),
    ).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it.each([
    {
      result: { ok: false as const, code: "VALIDATION_ERROR" },
      text: "The Script request was not valid. Check the three fields and try again.",
    },
    {
      result: { ok: false as const, code: "CONFLICT" },
      text: "This form was opened against an older Content DNA version.",
    },
    {
      result: { ok: false as const, code: "RATE_LIMITED", rateLimitSource: "workspace" as const },
      text: "No Attempt was created and no provider call was made.",
    },
    {
      result: { ok: false as const, code: "RATE_LIMITED", rateLimitSource: "provider" as const },
      text: "The provider was invoked and this Attempt was recorded as failed.",
    },
  ])(
    "shows safe localized Script action failure copy for $result.code",
    async ({ result, text }) => {
      mocks.generateContent.mockResolvedValueOnce(result);
      const user = renderWorkspace({
        currentDetail: detail({ ideas: [idea(1, { status: "ACCEPTED" })] }),
      });
      const card = screen.getByText("Idea title 1").closest("article");
      if (!card) throw new Error("Idea card was not rendered.");
      await user.click(within(card).getByRole("button", { name: "Generate Script" }));
      const dialog = await screen.findByRole("dialog", { name: "Generate a Script" });
      await user.click(within(dialog).getByRole("button", { name: "Generate Script" }));

      expect(await within(dialog).findByText(new RegExp(text))).toBeTruthy();
      expect(within(dialog).queryByText(/private|stack|provider details|sql/i)).toBeNull();
      if (result.code === "CONFLICT") {
        expect(mocks.refresh).not.toHaveBeenCalled();
        await user.click(within(dialog).getByRole("button", { name: "Reload current state" }));
        expect(mocks.refresh).toHaveBeenCalledOnce();
      }
    },
  );

  it("renders all persisted Attempt states, canonical instructions, and retries only FAILED history", async () => {
    const attempts = [
      contentAttempt({
        id: "attempt-pending",
        status: "PENDING",
        instructions: null,
        errorCategory: null,
        failedAt: null,
      }),
      contentAttempt({
        id: "attempt-running",
        status: "RUNNING",
        instructions: null,
        errorCategory: null,
        failedAt: null,
      }),
      contentAttempt({ id: "attempt-failed", status: "FAILED", errorCategory: "TIMEOUT" }),
      contentAttempt({
        id: "attempt-completed",
        status: "COMPLETED",
        errorCategory: null,
        instructions: "Canonical instruction",
        completedAt: new Date("2026-09-01T10:02:05Z"),
        failedAt: null,
        resultingContentId: "88888888-8888-4888-8888-888888888888",
      }),
    ];
    const user = renderWorkspace({
      currentDetail: detail({ ideas: [idea(1, { status: "ACCEPTED" })] }),
      currentContentGenerationHistory: { [firstIdeaId]: contentHistory(attempts) },
    });
    const card = screen.getByText("Idea title 1").closest("article");
    if (!card) throw new Error("Idea card was not rendered.");

    expect(within(card).getAllByText("Pending", { exact: true })).toHaveLength(1);
    expect(within(card).getAllByText("Running", { exact: true })).toHaveLength(1);
    expect(within(card).getAllByText("Failed", { exact: true })).toHaveLength(1);
    expect(within(card).getAllByText("Completed", { exact: true })).toHaveLength(1);
    expect(
      within(card).getByText("Canonical instruction", { exact: true }).getAttribute("dir"),
    ).toBe("auto");
    expect(
      within(card).getByRole("link", { name: "Open generated Content" }).getAttribute("href"),
    ).toBe("/content/88888888-8888-4888-8888-888888888888");
    expect(within(card).getAllByRole("button", { name: "Retry Script generation" })).toHaveLength(
      1,
    );
    expect(mocks.generateContent).not.toHaveBeenCalled();

    await user.click(within(card).getByRole("button", { name: "Retry Script generation" }));
    await waitFor(() => expect(mocks.retryContent).toHaveBeenCalledOnce());
    expect(mocks.retryContent).toHaveBeenCalledWith({ workspaceId, attemptId: "attempt-failed" });
    expect(mocks.push).toHaveBeenCalledWith("/content/retry-content-id");
  });

  it("maps every durable failed category to safe localized history copy", () => {
    renderWorkspace({
      currentDetail: detail({ ideas: [idea(1, { status: "ACCEPTED" })] }),
      currentContentGenerationHistory: {
        [firstIdeaId]: contentHistory([
          contentAttempt({
            id: "attempt-workspace-rate",
            errorCategory: "RATE_LIMITED",
            rateLimitSource: "workspace",
          }),
          contentAttempt({ id: "attempt-provider-rate", errorCategory: "RATE_LIMITED" }),
          contentAttempt({ id: "attempt-timeout", errorCategory: "TIMEOUT" }),
          contentAttempt({ id: "attempt-unavailable", errorCategory: "PROVIDER_UNAVAILABLE" }),
          contentAttempt({ id: "attempt-invalid", errorCategory: "INVALID_OUTPUT" }),
          contentAttempt({ id: "attempt-interrupted", errorCategory: "INTERRUPTED" }),
          contentAttempt({ id: "attempt-unknown", errorCategory: "UNKNOWN" }),
        ]),
      },
    });
    const card = screen.getByText("Idea title 1").closest("article");
    if (!card) throw new Error("Idea card was not rendered.");

    expect(
      within(card).getByText(/The workspace quota stopped this request before provider invocation/),
    ).toBeTruthy();
    expect(within(card).getByText(/The provider rate-limited this invoked Attempt/)).toBeTruthy();
    expect(within(card).getByText(/The invoked request exceeded its allowed time/)).toBeTruthy();
    expect(
      within(card).getByText(/The provider was unavailable for this invoked Attempt/),
    ).toBeTruthy();
    expect(within(card).getByText(/The invoked result did not pass validation/)).toBeTruthy();
    expect(
      within(card).getByText(/The invoked request was interrupted before completion/),
    ).toBeTruthy();
    expect(within(card).getByText(/The invoked request did not complete safely/)).toBeTruthy();
  });

  it("retains form values when the server refreshes the current DNA object", async () => {
    const currentDna = dna();
    const currentDetail = detail({ ideas: [idea(1, { status: "ACCEPTED" })] });
    const user = userEvent.setup();
    const view = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <IdeasWorkspace
          dna={currentDna}
          contentGenerationHistory={{}}
          initialDetail={currentDetail}
          initialHistory={{ batches: [batch()], selectedBatchId: batch().id }}
          workspaceId={workspaceId}
        />
      </NextIntlClientProvider>,
    );
    const card = screen.getByText("Idea title 1").closest("article");
    if (!card) throw new Error("Idea card was not rendered.");
    await user.click(within(card).getByRole("button", { name: "Generate Script" }));
    const dialog = await screen.findByRole("dialog", { name: "Generate a Script" });
    await user.click(within(dialog).getByRole("combobox", { name: "Format" }));
    await user.click(screen.getByRole("option", { name: "Long video" }));
    await user.type(
      within(dialog).getByLabelText("Instructions (optional)"),
      "Keep this exact guidance after refresh.",
    );

    const refreshedDna: IdeasDnaSummary = {
      ...currentDna,
      currentVersion: {
        ...currentDna.currentVersion!,
        contentLanguages: [...currentDna.currentVersion!.contentLanguages],
      },
    };
    view.rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <IdeasWorkspace
          dna={refreshedDna}
          contentGenerationHistory={{}}
          initialDetail={currentDetail}
          initialHistory={{ batches: [batch()], selectedBatchId: batch().id }}
          workspaceId={workspaceId}
        />
      </NextIntlClientProvider>,
    );

    expect(within(dialog).getByRole("combobox", { name: "Format" }).textContent).toContain(
      "Long video",
    );
    expect(
      (within(dialog).getByLabelText("Instructions (optional)") as HTMLTextAreaElement).value,
    ).toBe("Keep this exact guidance after refresh.");
  });

  it("keeps a failed retry safe and distinct when the workspace quota rejects it", async () => {
    mocks.retryContent.mockResolvedValueOnce({
      ok: false,
      code: "RATE_LIMITED",
      rateLimitSource: "workspace",
    });
    const user = renderWorkspace({
      currentDetail: detail({ ideas: [idea(1, { status: "ACCEPTED" })] }),
      currentContentGenerationHistory: {
        [firstIdeaId]: contentHistory([contentAttempt({ errorCategory: "PROVIDER_UNAVAILABLE" })]),
      },
    });
    const card = screen.getByText("Idea title 1").closest("article");
    if (!card) throw new Error("Idea card was not rendered.");
    await user.click(within(card).getByRole("button", { name: "Retry Script generation" }));

    expect(
      await screen.findByText(/No Attempt was created and no provider call was made/),
    ).toBeTruthy();
    expect(
      within(card).getByText(/The provider was unavailable for this invoked Attempt/),
    ).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("keeps UI RTL, mixed-direction instructions, and focus restoration truthful", async () => {
    const user = renderWorkspace({
      locale: "fa",
      currentDna: dna({
        currentVersion: {
          ...dna().currentVersion!,
          defaultContentLanguage: "fa",
        },
      }),
      currentDetail: detail({ ideas: [idea(1, { status: "ACCEPTED" })] }),
      currentContentGenerationHistory: {
        [firstIdeaId]: contentHistory([contentAttempt({ status: "FAILED" })]),
      },
    });
    const root = screen.getByText("Idea title 1").closest("div[dir=rtl]");
    expect(root).toBeTruthy();
    const card = screen.getByText("Idea title 1").closest("article");
    if (!card) throw new Error("Idea card was not rendered.");
    const trigger = within(card).getByRole("button", { name: "تولید اسکریپت" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "یک اسکریپت تولید کنید" });
    expect(within(dialog).getByRole("combobox", { name: "زبان درخواستی" }).textContent).toContain(
      "فارسی",
    );
    expect(within(dialog).getByLabelText("دستورها (اختیاری)").getAttribute("dir")).toBe("auto");
    const cancelButtons = within(dialog).getAllByRole("button", { name: "لغو" });
    await user.click(cancelButtons[cancelButtons.length - 1]!);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
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
