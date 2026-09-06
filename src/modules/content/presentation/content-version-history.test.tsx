// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import type { ContentVersionDto } from "../application/content-read-service";
import { ContentVersionHistory } from "./content-version-history";

const v1: ContentVersionDto = {
  id: "version-1",
  versionNumber: 1,
  document: { schemaVersion: 1, script: { text: "Legacy exact\nScript" } },
  source: "AI_GENERATED",
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  createdByName: "Creator",
  isCurrentAccepted: false,
};

const v2: ContentVersionDto = {
  id: "version-2",
  versionNumber: 2,
  document: {
    schemaVersion: 2,
    script: {
      blocks: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          type: "paragraph",
          text: "Current accepted Script",
          performanceDirections: [
            { id: "00000000-0000-4000-8000-000000000002", type: "PAUSE", duration: "short" },
          ],
          editDirections: [
            { id: "00000000-0000-4000-8000-000000000003", type: "CUT", style: "hard" },
          ],
        },
      ],
    },
  },
  source: "CREATOR_ACCEPTED",
  createdAt: new Date("2026-09-02T10:00:00.000Z"),
  createdByName: "Creator",
  isCurrentAccepted: true,
};

describe("ContentVersionHistory", () => {
  afterEach(cleanup);

  it("previews an exact V1 artifact without exposing editing controls", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ContentVersionHistory acceptedVersionId={null} contentLanguage="en" versions={[v1]} />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Version History" }));

    expect(screen.getByText(/Legacy exact/)).toBeTruthy();
    expect(screen.getByText("Read only")).toBeTruthy();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: /Restore|Edit Version|Delete Version/i }),
    ).toBeNull();
  });

  it("renders V2 Script and Production Directions with content-language semantics", () => {
    render(
      <NextIntlClientProvider locale="fa" messages={fa}>
        <ContentVersionHistory
          acceptedVersionId="version-2"
          contentLanguage="fa"
          versions={[v1, v2]}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "باز کردن تاریخچهٔ نسخه‌ها" }));

    expect(screen.getByText("Current accepted Script").getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("مکث")).toBeTruthy();
    expect(screen.getByText("برش")).toBeTruthy();
    expect(screen.getByText("اکنون پذیرفته‌شده")).toBeTruthy();
    expect(screen.getByRole("button", { name: "بازگشت به پیش‌نویس" })).toBeTruthy();
  });
});
