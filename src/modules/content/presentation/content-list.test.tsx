// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import type { ContentListItemDto } from "../application/content-read-service";

const mocks = vi.hoisted(() => ({
  locale: "en" as "en" | "fa",
  getTranslations: vi.fn(),
}));

vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}));

import { ContentList } from "./content-list";

function item(position: number, overrides: Partial<ContentListItemDto> = {}): ContentListItemDto {
  return {
    id: `content-${position}`,
    sourceIdeaTitle: `Source idea ${position}`,
    format: position === 1 ? "SHORT_VIDEO" : "LONG_VIDEO",
    contentLanguage: position === 1 ? "en" : "fa",
    lastEditedAt: new Date(`2026-09-0${position}T10:00:00.000Z`),
    ...overrides,
  };
}

async function renderList(content: readonly ContentListItemDto[], locale: "en" | "fa" = "en") {
  mocks.locale = locale;
  const result = await ContentList({ content, locale });
  return render(result);
}

describe("ContentList", () => {
  beforeEach(() => {
    mocks.getTranslations.mockImplementation(async () => {
      const messages = mocks.locale === "fa" ? fa.Content : en.Content;

      return (key: string, values?: Readonly<Record<string, string | number>>) => {
        const message = messages[key as keyof typeof messages] as string;
        return Object.entries(values ?? {}).reduce(
          (result, [name, value]) => result.replace(`{${name}}`, String(value)),
          message,
        );
      };
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the empty state without introducing a second content workflow", async () => {
    await renderList([]);

    expect(screen.getByRole("heading", { name: "No Content Drafts yet" })).toBeTruthy();
    expect(
      screen.getByText("Generated Content Drafts will appear here when they are ready to edit."),
    ).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("presents only the approved DTO fields in the DTO-provided order", async () => {
    const content = [
      item(2, {
        sourceIdeaTitle: "Later-edited idea",
        lastEditedAt: new Date("2026-09-10T10:00:00.000Z"),
      }),
      item(1, {
        sourceIdeaTitle: "Earlier-edited idea",
        lastEditedAt: new Date("2026-09-01T10:00:00.000Z"),
      }),
    ];
    await renderList(content);

    const list = screen.getByRole("list", { name: "Content Drafts" });
    expect(list.className).toContain("sm:grid-cols-2");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole("heading", { name: "Later-edited idea" })).toBeTruthy();
    expect(within(rows[1]!).getByRole("heading", { name: "Earlier-edited idea" })).toBeTruthy();
    expect(within(rows[0]!).getByText(/Long video/)).toBeTruthy();
    expect(within(rows[0]!).getByText(/Persian/)).toBeTruthy();
    expect(within(rows[0]!).getByText(/Sep 10, 2026/)).toBeTruthy();

    expect(screen.queryByText(/Content title/i)).toBeNull();
    expect(screen.queryByText(/Search|Filter|Archive|Delete|Published|Metrics/i)).toBeNull();
    expect(within(rows[0]!).getByRole("link").getAttribute("href")).toBe("/content/content-2");
    expect(within(rows[0]!).getByRole("link").querySelector("dl")).toBeNull();
    expect(within(rows[0]!).getByRole("link").className).toContain("min-h-32");
  });

  it("keeps content-language metadata explicit for RTL content", async () => {
    await renderList(
      [
        item(1, {
          sourceIdeaTitle: "ایدهٔ فارسی",
          contentLanguage: "fa",
        }),
      ],
      "en",
    );

    const title = screen.getByRole("heading", { name: "ایدهٔ فارسی" });
    const row = title.closest("li");
    if (!row) throw new Error("Content row was not rendered.");

    expect(title.getAttribute("dir")).toBe("auto");
    expect(
      within(row)
        .getByText(/Persian/)
        .getAttribute("lang"),
    ).toBeNull();
    expect(within(row).getByRole("link").getAttribute("href")).toBe("/content/content-1");
  });

  it("renders the same approved list in localized Persian UI", async () => {
    await renderList(
      [
        item(1, {
          sourceIdeaTitle: "ایدهٔ محتوایی",
          contentLanguage: "fa",
        }),
      ],
      "fa",
    );

    expect(screen.getByRole("list", { name: "پیش‌نویس‌های محتوا" })).toBeTruthy();
    expect(screen.getByText(/فارسی/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "باز کردن ویرایشگر اسکریپت برای ایدهٔ محتوایی" }),
    ).toBeTruthy();
  });
});
