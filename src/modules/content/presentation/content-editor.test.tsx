// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../../../messages/en.json";
import { UnsavedChangesProvider } from "@/components/navigation/unsaved-changes-provider";
import type { ContentDetailDto } from "../application/content-read-service";
vi.mock("../application/content-actions", () => ({
  acceptContentAction: vi.fn(),
  getContentDraftAction: vi.fn(),
  saveContentDraftAction: vi.fn(),
}));
import { ContentEditor } from "./content-editor";
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
    v2Projection: {
      schemaVersion: 2,
      script: {
        blocks: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            type: "paragraph",
            text: "First",
            performanceDirections: [],
            editDirections: [],
          },
          {
            id: "00000000-0000-4000-8000-000000000002",
            type: "paragraph",
            text: "Second",
            performanceDirections: [],
            editDirections: [],
          },
        ],
      },
    },
    revision: 4,
    updatedAt: new Date(),
  },
});
describe("ContentEditor", () => {
  afterEach(cleanup);
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
});
