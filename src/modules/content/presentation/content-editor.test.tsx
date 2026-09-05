// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import { UnsavedChangesProvider } from "@/components/navigation/unsaved-changes-provider";
import type { ContentDetailDto } from "../application/content-read-service";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock("../application/content-actions", () => ({
  getContentDraftAction: mocks.load,
  saveContentDraftAction: mocks.save,
}));

import { ContentEditor } from "./content-editor";
import { CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS } from "./use-content-draft-autosave";

const contentId = "content-1";
const workspaceId = "workspace-1";

function makeContent(overrides: Partial<ContentDetailDto> = {}): ContentDetailDto {
  return {
    id: contentId,
    sourceIdea: { id: "idea-1", title: "A source idea" },
    contentLanguage: "en",
    format: "SHORT_VIDEO",
    draft: {
      document: {
        schemaVersion: 1,
        script: { text: "Initial script" },
      },
      revision: 4,
      updatedAt: new Date("2026-09-01T10:00:00.000Z"),
    },
    ...overrides,
  };
}

function makeDraft(revision: number, text: string) {
  return {
    document: { schemaVersion: 1 as const, script: { text } },
    revision,
    updatedAt: new Date("2026-09-01T11:00:00.000Z"),
  };
}

function renderEditor({
  locale = "en",
  content = makeContent(),
}: Readonly<{
  locale?: "en" | "fa";
  content?: ContentDetailDto;
}> = {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "fa" ? fa : en}>
      <UnsavedChangesProvider>
        <ContentEditor content={content} workspaceId={workspaceId} />
      </UnsavedChangesProvider>
    </NextIntlClientProvider>,
  );
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function scriptField() {
  return screen.getByRole("textbox", { name: /Script text|متن اسکریپت/ }) as HTMLTextAreaElement;
}

describe("ContentEditor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.save.mockResolvedValue({ ok: true, draft: makeDraft(5, "Changed") });
    mocks.load.mockResolvedValue({ ok: true, content: makeContent() });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("hydrates the exact initial document and revision without interpreting HTML-like text", () => {
    const literal = "<script>alert('literal')</script>\n<b>Keep this markup</b>";
    renderEditor({
      content: makeContent({
        draft: {
          document: { schemaVersion: 1, script: { text: literal } },
          revision: 8,
          updatedAt: new Date("2026-09-01T10:00:00.000Z"),
        },
      }),
    });

    expect(scriptField().value).toBe(literal);
    expect(screen.getByText("Revision 8")).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByRole("heading", { name: "Script" })).toBeTruthy();
  });

  it("supports an empty Draft as a plain text editor", () => {
    renderEditor({
      content: makeContent({
        draft: {
          document: { schemaVersion: 1, script: { text: "" } },
          revision: 1,
          updatedAt: new Date("2026-09-01T10:00:00.000Z"),
        },
      }),
    });

    expect(scriptField().value).toBe("");
    expect(scriptField().tagName).toBe("TEXTAREA");
    expect(scriptField().getAttribute("maxlength")).toBe("50000");
  });

  it.each([
    {
      contentLanguage: "en" as const,
      locale: "en" as const,
      dir: "ltr",
    },
    {
      contentLanguage: "fa" as const,
      locale: "en" as const,
      dir: "rtl",
    },
    {
      contentLanguage: "en" as const,
      locale: "fa" as const,
      dir: "ltr",
    },
    {
      contentLanguage: "fa" as const,
      locale: "fa" as const,
      dir: "rtl",
    },
  ])(
    "derives editor language and direction from Content language independently of UI locale",
    ({ contentLanguage, locale, dir }) => {
      renderEditor({ locale, content: makeContent({ contentLanguage }) });

      const field = scriptField();
      expect(field.getAttribute("lang")).toBe(contentLanguage);
      expect(field.getAttribute("dir")).toBe(dir);
      expect(field.className).not.toContain("font-content");
      const sourceIdea = screen.getByText("A source idea");
      expect(sourceIdea.getAttribute("lang")).toBe(contentLanguage);
      expect(sourceIdea.getAttribute("dir")).toBe(dir);
    },
  );

  it("preserves the document when the UI locale changes", () => {
    const content = makeContent({
      contentLanguage: "fa",
      draft: {
        document: { schemaVersion: 1, script: { text: "متن فارسی / English" } },
        revision: 4,
        updatedAt: new Date("2026-09-01T10:00:00.000Z"),
      },
    });
    const view = renderEditor({ content, locale: "en" });
    const field = scriptField();

    fireEvent.change(field, { target: { value: "متن محلی / English" } });
    view.rerender(
      <NextIntlClientProvider locale="fa" messages={fa}>
        <UnsavedChangesProvider>
          <ContentEditor content={content} workspaceId={workspaceId} />
        </UnsavedChangesProvider>
      </NextIntlClientProvider>,
    );

    expect(scriptField().value).toBe("متن محلی / English");
    expect(scriptField().getAttribute("dir")).toBe("rtl");
    expect(scriptField().getAttribute("lang")).toBe("fa");
  });

  it("announces a successful debounced save and advances the server revision", async () => {
    mocks.save.mockResolvedValueOnce({ ok: true, draft: makeDraft(5, "Changed") });
    renderEditor();
    fireEvent.change(scriptField(), { target: { value: "Changed" } });

    expect(screen.getByText("Unsaved", { exact: true })).toBeTruthy();
    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS));
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(screen.getByText("Saving…", { exact: true })).toBeTruthy();

    await flushAsyncWork();

    expect(mocks.save.mock.calls[0]?.[0]).toMatchObject({
      workspaceId,
      contentId,
      baseRevision: 4,
      document: { schemaVersion: 1, script: { text: "Changed" } },
    });
    expect(screen.getByText("Saved", { exact: true })).toBeTruthy();
    expect(screen.getByText("Revision 5")).toBeTruthy();
  });

  it("preserves failed local text, stops automatic retries, and offers explicit retry", async () => {
    mocks.save
      .mockReset()
      .mockResolvedValueOnce({ ok: false, code: "INTERNAL_ERROR" as const })
      .mockResolvedValueOnce({ ok: true, draft: makeDraft(5, "Changed after retry") });
    renderEditor();
    fireEvent.change(scriptField(), { target: { value: "Changed" } });
    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS));
    await flushAsyncWork();

    expect(scriptField().value).toBe("Changed");
    expect(screen.getByText("Your Script was not saved")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry save" })).toBeTruthy();

    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS * 3));
    expect(mocks.save).toHaveBeenCalledOnce();

    fireEvent.change(scriptField(), { target: { value: "Changed after retry" } });
    expect(screen.getByText("Unsaved", { exact: true })).toBeTruthy();
    expect(mocks.save).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await flushAsyncWork();

    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1]?.[0]).toMatchObject({
      baseRevision: 4,
      document: { script: { text: "Changed after retry" } },
    });
    expect(screen.getByText("Saved", { exact: true })).toBeTruthy();
  });

  it("stops on conflict, retains local text, and only replaces it after explicit Reload", async () => {
    const localText = "Local <b>text</b> that must remain";
    mocks.save.mockReset().mockResolvedValueOnce({ ok: false, code: "CONFLICT" as const });
    mocks.load.mockResolvedValueOnce({
      ok: true,
      content: makeContent({ draft: makeDraft(9, "Server text") }),
    });
    renderEditor();
    fireEvent.change(scriptField(), { target: { value: localText } });
    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS));
    await flushAsyncWork();

    expect(screen.getByText("This Draft changed elsewhere")).toBeTruthy();
    expect(scriptField().value).toBe(localText);
    expect(screen.getByRole("button", { name: "Reload authoritative Draft" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy unsaved text" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reload authoritative Draft" }));
    await flushAsyncWork();

    expect(mocks.load).toHaveBeenCalledWith({ workspaceId, contentId });
    expect(scriptField().value).toBe("Server text");
    expect(screen.getByText("Saved", { exact: true })).toBeTruthy();
    expect(screen.getByText("Revision 9")).toBeTruthy();
  });

  it("copies retained conflict text and preserves it when clipboard access fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const localText = "Keep this unsaved";
    mocks.save.mockResolvedValueOnce({ ok: false, code: "CONFLICT" as const });
    renderEditor();
    fireEvent.change(scriptField(), { target: { value: localText } });
    act(() => vi.advanceTimersByTime(CONTENT_DRAFT_AUTOSAVE_DEBOUNCE_MS));
    await flushAsyncWork();

    fireEvent.click(screen.getByRole("button", { name: "Copy unsaved text" }));
    await flushAsyncWork();

    expect(writeText).toHaveBeenCalledWith(localText);
    expect(scriptField().value).toBe(localText);
    expect(screen.getByText(/Could not copy the unsaved text/)).toBeTruthy();
  });
});
