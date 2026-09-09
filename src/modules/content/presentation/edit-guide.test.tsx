// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import type { ContentEditGuideResult } from "../application/content-read-service";
import { projectContentDocumentToEditGuide, type ContentDocumentV4 } from "../domain";

vi.mock("@/modules/assets/presentation/private-asset-preview", () => ({
  PrivateAssetAudioPreview: ({ label }: { label: string }) => <audio aria-label={label} controls />,
  PrivateAssetImagePreview: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
  PrivateAssetVideoPreview: ({ label }: { label: string }) => <video aria-label={label} controls />,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

import { EditGuide } from "./edit-guide";

const ids = Array.from(
  { length: 10 },
  (_, index) => `00000000-0000-4000-8000-0000000000${String(index + 1).padStart(2, "0")}`,
);
const [blockId, overlayId, zoomId, cutId, brollId, soundId, captionId, noteId, imageId, audioId] =
  ids;

const document: ContentDocumentV4 = {
  schemaVersion: 4,
  script: {
    blocks: [
      {
        id: blockId!,
        type: "paragraph",
        text: "English script / متن فارسی",
        performanceDirections: [],
        editDirections: [
          { id: overlayId!, type: "TEXT_OVERLAY", text: "Overlay text", placement: "center" },
          { id: zoomId!, type: "ZOOM", mode: "in", intensity: "strong" },
          { id: cutId!, type: "CUT", style: "jump" },
          {
            id: brollId!,
            type: "BROLL_CUE",
            description: "Show the product",
            searchQuery: "product desk 42",
            assetId: imageId!,
          },
          {
            id: soundId!,
            type: "SOUND_CUE",
            kind: "sound_effect",
            description: "Add a click",
            assetId: audioId!,
          },
          { id: captionId!, type: "CAPTION_EMPHASIS", style: "highlight" },
          { id: noteId!, type: "EDIT_NOTE", text: "Keep the cut tight." },
        ],
      },
    ],
  },
};

const ready: Extract<ContentEditGuideResult, { status: "READY" }> = {
  status: "READY",
  contentId: "content-1",
  contentTitle: "A creator idea",
  contentLanguage: "en",
  acceptedVersionId: "version-2",
  acceptedVersionNumber: 2,
  scriptBlocks: projectContentDocumentToEditGuide(document),
  assetPresentations: {
    [imageId!]: {
      displayName: "Product still",
      mediaType: "IMAGE",
      width: 640,
      height: 360,
      previewable: true,
    },
    [audioId!]: {
      displayName: "Click sound",
      mediaType: "AUDIO",
      width: null,
      height: null,
      previewable: true,
    },
  },
};

function renderGuide(value = ready, locale: "en" | "fa" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "fa" ? fa : en}>
      <EditGuide editGuide={value} locale={locale} workspaceId="workspace-1" />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
});

describe("EditGuide", () => {
  it("keeps Script-to-direction association and presents every Edit Direction variant", () => {
    renderGuide();

    expect(screen.getByRole("main").getAttribute("lang")).toBe("en");
    expect(screen.getByText("English script / متن فارسی").getAttribute("lang")).toBe("en");
    expect(screen.getByText("Text overlay")).toBeTruthy();
    expect(screen.getByText("Zoom")).toBeTruthy();
    expect(screen.getByText("Cut")).toBeTruthy();
    expect(screen.getByText("B-roll")).toBeTruthy();
    expect(screen.getByText("Sound cue")).toBeTruthy();
    expect(screen.getByText("Caption emphasis")).toBeTruthy();
    expect(screen.getByText("Edit note")).toBeTruthy();
    expect(screen.getByText("Overlay text")).toBeTruthy();
    expect(screen.getByText("center")).toBeTruthy();
    expect(screen.getByText("in")).toBeTruthy();
    expect(screen.getByText("strong")).toBeTruthy();
    expect(screen.getByText("jump")).toBeTruthy();
    expect(screen.getByText("Show the product")).toBeTruthy();
    expect(screen.getByText("product desk 42")).toBeTruthy();
    expect(screen.getByText("sound effect")).toBeTruthy();
    expect(screen.getByText("Add a click")).toBeTruthy();
    expect(screen.getByText("highlight")).toBeTruthy();
    expect(screen.getByText("Keep the cut tight.")).toBeTruthy();
    expect(screen.getByText("Product still")).toBeTruthy();
    expect(screen.getByRole("img", { name: /B-roll Asset preview/ })).toBeTruthy();
    expect(screen.getByLabelText(/Sound cue Asset preview/)).toBeTruthy();
  });

  it("copies the exact B-roll query through the clipboard without changing the DTO", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const before = structuredClone(ready);
    renderGuide();

    fireEvent.click(screen.getByRole("button", { name: "Copy search term" }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("product desk 42"));
    expect((await screen.findByRole("status")).textContent).toContain("Search term copied.");
    expect(ready).toEqual(before);
  });

  it("reports an accessible failure when the clipboard is unavailable", async () => {
    renderGuide();

    fireEvent.click(screen.getByRole("button", { name: "Copy search term" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not copy the search term.",
    );
  });

  it("keeps UI locale direction separate from creator-content semantics", () => {
    const persianContent = { ...ready, contentLanguage: "fa" as const };
    renderGuide(persianContent, "fa");

    expect(screen.getByRole("main").getAttribute("lang")).toBe("fa");
    expect(screen.getByRole("main").getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("English script / متن فارسی").getAttribute("lang")).toBe("fa");
    expect(screen.getByText("English script / متن فارسی").getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("button", { name: "کپی عبارت جست‌وجو" })).toBeTruthy();
  });

  it("keeps a direction visible when its attached Asset is unavailable", () => {
    const withoutAsset = {
      ...ready,
      assetPresentations: {},
    };
    renderGuide(withoutAsset);

    expect(screen.getByText("Show the product")).toBeTruthy();
    expect(screen.getAllByText("Media unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
