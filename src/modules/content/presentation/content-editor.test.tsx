// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../../../messages/en.json";
import { UnsavedChangesProvider } from "@/components/navigation/unsaved-changes-provider";
import type { ContentDetailDto } from "../application/content-read-service";
import { saveContentDraftAction } from "../application/content-actions";
vi.mock("../application/content-actions", () => ({
  acceptContentAction: vi.fn(),
  getContentDraftAction: vi.fn(),
  saveContentDraftAction: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("./direction-asset-picker", () => ({
  DirectionAssetPicker: () => null,
}));
import { ContentEditor } from "./content-editor";
import { projectContentDocumentV2ToV3 } from "../domain";
const v2Projection = {
  schemaVersion: 2 as const,
  script: {
    blocks: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        type: "paragraph" as const,
        text: "First",
        performanceDirections: [],
        editDirections: [],
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        type: "paragraph" as const,
        text: "Second",
        performanceDirections: [],
        editDirections: [],
      },
    ],
  },
};
const content = (language: "en" | "fa" = "en"): ContentDetailDto => ({
  id: "c",
  sourceIdea: { id: "i", title: "Idea" },
  contentLanguage: language,
  format: "SHORT_VIDEO",
  acceptedVersionId: null,
  versions: [
    {
      id: "version-1",
      versionNumber: 1,
      document: { schemaVersion: 1, script: { text: "First\nSecond" } },
      source: "AI_GENERATED",
      createdAt: new Date("2026-09-01T10:00:00.000Z"),
      createdByName: "Creator",
      isCurrentAccepted: false,
    },
  ],
  draft: {
    document: { schemaVersion: 1, script: { text: "First\nSecond" } },
    editorDocument: projectContentDocumentV2ToV3(v2Projection),
    v2Projection,
    revision: 4,
    updatedAt: new Date(),
  },
});
describe("ContentEditor", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });
  it("uses the V1 projection without marking it dirty and gives blocks content language semantics", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <UnsavedChangesProvider>
          <ContentEditor content={content("fa")} workspaceId="w" />
        </UnsavedChangesProvider>
      </NextIntlClientProvider>,
    );
    const fields = screen.getAllByRole("textbox");
    expect(fields).toHaveLength(2);
    expect(fields[0].getAttribute("lang")).toBe("fa");
    expect(fields[0].getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("Saved")).toBeTruthy();
  });
  it("splits and merges using native textareas", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <UnsavedChangesProvider>
          <ContentEditor content={content()} workspaceId="w" />
        </UnsavedChangesProvider>
      </NextIntlClientProvider>,
    );
    const first = screen.getAllByRole("textbox")[0] as HTMLTextAreaElement;
    first.focus();
    first.setSelectionRange(2, 2);
    fireEvent.keyDown(first, { key: "Enter" });
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
    const next = screen.getAllByRole("textbox")[1] as HTMLTextAreaElement;
    expect(document.activeElement).toBe(next);
    fireEvent.keyDown(next, { key: "Backspace" });
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect((screen.getAllByRole("textbox")[0] as HTMLTextAreaElement).value).toBe("First");
  });

  it("gates acceptance while the visible Draft is dirty", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <UnsavedChangesProvider>
          <ContentEditor content={content()} workspaceId="w" />
        </UnsavedChangesProvider>
      </NextIntlClientProvider>,
    );

    const accept = screen.getByRole("button", { name: "Accept Draft" });
    expect(accept.hasAttribute("disabled")).toBe(false);

    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Changed" } });

    expect(accept.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Save the current Draft before accepting.")).toBeTruthy();
  });

  it("saves immediately when Save now is clicked", async () => {
    vi.mocked(saveContentDraftAction).mockResolvedValueOnce({
      ok: true,
      draft: content().draft,
    });

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <UnsavedChangesProvider>
          <ContentEditor content={content()} workspaceId="w" />
        </UnsavedChangesProvider>
      </NextIntlClientProvider>,
    );

    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Changed" } });
    const saveNow = screen.getByRole("button", { name: "Save now" });
    fireEvent.click(saveNow);

    expect(saveContentDraftAction).toHaveBeenCalledOnce();
    expect(saveContentDraftAction).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w", contentId: "c", baseRevision: 4 }),
    );
  });

  it("opens only the current accepted Version in Teleprompter", () => {
    const accepted = {
      ...content(),
      acceptedVersionId: "version-1",
      versions: content().versions.map((version) => ({
        ...version,
        source: "CREATOR_ACCEPTED" as const,
        isCurrentAccepted: true,
      })),
    };

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <UnsavedChangesProvider>
          <ContentEditor content={accepted} workspaceId="w" />
        </UnsavedChangesProvider>
      </NextIntlClientProvider>,
    );

    const link = screen.getByRole("link", { name: "Open Teleprompter for Idea" });
    expect(link.getAttribute("href")).toBe("/content/c/teleprompter");
    const editGuide = screen.getByRole("link", { name: "Open Edit Guide for Idea" });
    expect(editGuide.getAttribute("href")).toBe("/content/c/edit-guide");
  });
});
