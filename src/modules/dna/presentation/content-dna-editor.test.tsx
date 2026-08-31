// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import type { CurrentContentDnaDto, ContentDnaVersionDto } from "@/modules/dna/application";

import { ContentDnaEditor } from "./content-dna-editor";

const { save, load } = vi.hoisted(() => ({ save: vi.fn(), load: vi.fn() }));
vi.mock("@/modules/dna/application/save-content-dna-action", () => ({
  saveContentDnaAction: save,
  loadCurrentContentDnaAction: load,
}));

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

const empty: CurrentContentDnaDto = { status: "NOT_CREATED", currentVersion: null };

function version(overrides: Partial<ContentDnaVersionDto> = {}): ContentDnaVersionDto {
  return {
    id: "v1",
    versionNumber: 1,
    readiness: "INCOMPLETE",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    isCurrent: true,
    payload: {
      schemaVersion: 1,
      identity: { creatorOrBrandDescription: "Creator" },
      expertise: { primaryTopics: ["One", "Two"] },
      language: { defaultContentLanguage: "fa", contentLanguages: ["en", "fa"] },
    },
    ...overrides,
  };
}

function current(overrides: Partial<ContentDnaVersionDto> = {}): CurrentContentDnaDto {
  const currentVersion = version(overrides);
  return { status: currentVersion.readiness, currentVersion };
}

function renderEditor(locale = "en", data: CurrentContentDnaDto = empty) {
  const user = userEvent.setup();
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "fa" ? fa : en}>
      <ContentDnaEditor initialContentDna={data} workspaceId="workspace" />
    </NextIntlClientProvider>,
  );
  return user;
}

function editDescription(value: string) {
  const field = screen.getByLabelText("Creator or brand description");
  fireEvent.change(field, { target: { value } });
  return field;
}

describe("ContentDnaEditor", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the English NOT_CREATED state and privacy notice", () => {
    renderEditor();
    expect(screen.getByRole("heading", { name: "Start your Content DNA" })).toBeTruthy();
    expect(screen.getByText("Keep private information out")).toBeTruthy();
    expect(screen.getByRole("form").getAttribute("dir")).toBe("ltr");
  });

  it("hydrates the current DTO and presents server readiness and version", () => {
    renderEditor("en", current({ readiness: "AI_READY", versionNumber: 4 }));
    expect(screen.getByDisplayValue("Creator")).toBeTruthy();
    expect(screen.getByDisplayValue("One")).toBeTruthy();
    expect(screen.getByText("AI-ready")).toBeTruthy();
    expect(screen.getByText("Version 4")).toBeTruthy();
  });

  it("submits a partial save and resets dirty state from the server result", async () => {
    const user = renderEditor();
    save.mockResolvedValueOnce({
      ok: true,
      version: version({
        id: "v2",
        readiness: "AI_READY",
        payload: { schemaVersion: 1, identity: { creatorOrBrandDescription: "Partial" } },
      }),
    });

    editDescription("Partial");
    expect(screen.getByText("You have unsaved changes.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save Content DNA" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatchObject({
      workspaceId: "workspace",
      baseVersionId: null,
      payload: { identity: { creatorOrBrandDescription: "Partial" } },
    });
    expect(await screen.findByText("AI-ready")).toBeTruthy();
    expect(screen.queryByText("You have unsaved changes.")).toBeNull();
  });

  it("clears dirty state after an identical-save result", async () => {
    const user = renderEditor("en", current());
    save.mockResolvedValueOnce({ ok: true, version: version() });
    editDescription("Creator ");
    await user.click(screen.getByRole("button", { name: "Save Content DNA" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("You have unsaved changes.")).toBeNull();
  });

  it("keeps edits dirty and shows localized feedback when saving rejects", async () => {
    const user = renderEditor();
    save.mockRejectedValueOnce(new Error("transport failed"));
    const field = editDescription("Mine");
    await user.click(screen.getByRole("button", { name: "Save Content DNA" }));
    expect(await screen.findByText("Content DNA was not saved")).toBeTruthy();
    expect((field as HTMLTextAreaElement).value).toBe("Mine");
    expect(screen.getByText("You have unsaved changes.")).toBeTruthy();
  });

  it("renders field-associated localized validation feedback", async () => {
    const user = renderEditor();
    const field = editDescription("x".repeat(1501));
    await user.click(screen.getByRole("button", { name: "Save Content DNA" }));
    const error = await screen.findByText("Use no more than 1500 characters.");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toContain(error.id);
    expect(error.getAttribute("role")).toBe("alert");
    expect(save).not.toHaveBeenCalled();
  });

  it("gives every editor control a consistent visible keyboard-focus treatment", async () => {
    const user = renderEditor("en", current());
    const focusableControls = [
      screen.getByLabelText("Creator or brand description"),
      screen.getByLabelText("Primary topics, item 1"),
      screen.getByRole("combobox", { name: "Default content language" }),
      screen.getByRole("checkbox", { name: "English" }),
      screen.getByRole("button", { name: "Add to Primary topics" }),
      screen.getByRole("button", { name: "Move Two up" }),
      screen.getByRole("button", { name: "Move One down" }),
      screen.getByRole("button", { name: "Remove One" }),
      screen.getByRole("button", { name: "Save Content DNA" }),
    ];

    for (const control of focusableControls) {
      expect(control.className).toContain("focus-visible:ring");
    }

    save.mockResolvedValueOnce({ ok: false, code: "CONFLICT" });
    editDescription("Mine");
    await user.click(screen.getByRole("button", { name: "Save Content DNA" }));
    expect(
      (await screen.findByRole("button", { name: "Reload latest version" })).className,
    ).toContain("focus-visible:ring");
  });

  it("preserves local values and dirty state on conflict", async () => {
    const user = renderEditor();
    save.mockResolvedValueOnce({ ok: false, code: "CONFLICT" });
    const field = editDescription("Mine");
    await user.click(screen.getByRole("button", { name: "Save Content DNA" }));
    expect(await screen.findByText("A newer version is available")).toBeTruthy();
    expect((field as HTMLTextAreaElement).value).toBe("Mine");
    expect(screen.getByText("You have unsaved changes.")).toBeTruthy();
  });

  it("reloads the latest version only after explicit conflict recovery", async () => {
    const user = renderEditor();
    save.mockResolvedValueOnce({ ok: false, code: "CONFLICT" });
    load.mockResolvedValueOnce({
      ok: true,
      current: current({
        id: "latest",
        payload: { schemaVersion: 1, identity: { creatorOrBrandDescription: "Latest" } },
      }),
    });
    editDescription("Mine");
    await user.click(screen.getByRole("button", { name: "Save Content DNA" }));
    await user.click(await screen.findByRole("button", { name: "Reload latest version" }));
    expect(await screen.findByDisplayValue("Latest")).toBeTruthy();
    expect(screen.queryByText("You have unsaved changes.")).toBeNull();
  });

  it("keeps edits dirty and shows actionable feedback when reload fails", async () => {
    const user = renderEditor();
    save.mockResolvedValueOnce({ ok: false, code: "CONFLICT" });
    load.mockResolvedValueOnce({ ok: false });
    const field = editDescription("Mine");
    await user.click(screen.getByRole("button", { name: "Save Content DNA" }));
    await user.click(await screen.findByRole("button", { name: "Reload latest version" }));
    expect(await screen.findByText("Latest version could not be loaded")).toBeTruthy();
    expect((field as HTMLTextAreaElement).value).toBe("Mine");
    expect(screen.getByText("You have unsaved changes.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload latest version" })).toBeTruthy();
  });

  it("handles a rejected reload without discarding edits and allows retry", async () => {
    const user = renderEditor();
    save.mockResolvedValueOnce({ ok: false, code: "CONFLICT" });
    load.mockRejectedValueOnce(new Error("transport failed")).mockResolvedValueOnce({
      ok: true,
      current: current({
        id: "latest",
        payload: { schemaVersion: 1, identity: { creatorOrBrandDescription: "Latest" } },
      }),
    });
    const field = editDescription("Mine");
    await user.click(screen.getByRole("button", { name: "Save Content DNA" }));
    await user.click(await screen.findByRole("button", { name: "Reload latest version" }));
    expect(await screen.findByText("Latest version could not be loaded")).toBeTruthy();
    expect((field as HTMLTextAreaElement).value).toBe("Mine");
    expect(screen.getByText("You have unsaved changes.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Reload latest version" }));
    expect(await screen.findByDisplayValue("Latest")).toBeTruthy();
    expect(screen.queryByText("You have unsaved changes.")).toBeNull();
  });

  it("adds and removes dynamic list items", async () => {
    const user = renderEditor();
    await user.click(screen.getByRole("button", { name: "Add to Preferred formats" }));
    expect(screen.getAllByLabelText(/Preferred formats, item/)).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Remove 2" }));
    expect(screen.getAllByLabelText(/Preferred formats, item/)).toHaveLength(1);
  });

  it("reorders priority lists and disables boundary controls", async () => {
    const user = renderEditor("en", current());
    const expertise = screen
      .getByRole("heading", { name: "Expertise" })
      .closest("[data-slot=card]") as HTMLElement;
    expect(
      (within(expertise).getByRole("button", { name: "Move One up" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(expertise).getByRole("button", { name: "Move Two down" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(within(expertise).getByRole("button", { name: "Move Two up" }));
    expect((within(expertise).getAllByRole("textbox")[0] as HTMLInputElement).value).toBe("Two");
    await user.click(within(expertise).getByRole("button", { name: "Move Two down" }));
    expect((within(expertise).getAllByRole("textbox")[0] as HTMLInputElement).value).toBe("One");
  });

  it("supports default and additional content-language selection", async () => {
    const user = renderEditor("en");
    await user.click(screen.getByRole("combobox", { name: "Default content language" }));
    await user.click(screen.getByRole("option", { name: "Persian" }));
    expect(screen.getByRole("combobox", { name: "Default content language" }).textContent).toBe(
      "Persian",
    );
    await user.click(screen.getByRole("checkbox", { name: "Persian" }));
    expect(screen.getByRole("checkbox", { name: "Persian" }).getAttribute("data-state")).toBe(
      "checked",
    );
  });

  it("does not mutate persisted content-language preferences when the UI locale changes", () => {
    const persisted = current();
    renderEditor("en", persisted);
    expect(screen.getByRole("checkbox", { name: "English" }).getAttribute("data-state")).toBe(
      "checked",
    );
    expect(screen.getByRole("checkbox", { name: "Persian" }).getAttribute("data-state")).toBe(
      "checked",
    );
    cleanup();
    renderEditor("fa", persisted);
    expect(screen.getByRole("checkbox", { name: "انگلیسی" }).getAttribute("data-state")).toBe(
      "checked",
    );
    expect(screen.getByRole("checkbox", { name: "فارسی" }).getAttribute("data-state")).toBe(
      "checked",
    );
  });

  it("renders localized Persian UI with RTL direction", () => {
    renderEditor("fa");
    expect(screen.getByRole("heading", { name: "DNA محتوای خود را آغاز کنید" })).toBeTruthy();
    expect(screen.getByRole("form").getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("اطلاعات خصوصی را وارد نکنید")).toBeTruthy();
  });
});
