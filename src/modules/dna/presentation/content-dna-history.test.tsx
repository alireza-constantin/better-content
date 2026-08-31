// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import type { ContentDnaVersionDto } from "@/modules/dna/application";

import { ContentDnaHistory, ContentDnaVersionDetail } from "./content-dna-history";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}));

function version(overrides: Partial<ContentDnaVersionDto> = {}): ContentDnaVersionDto {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    versionNumber: 1,
    readiness: "INCOMPLETE",
    createdAt: new Date("2026-09-01T10:30:00Z"),
    isCurrent: false,
    payload: {
      schemaVersion: 1,
      identity: { creatorOrBrandDescription: "English + فارسی creator context" },
      language: { defaultContentLanguage: "en", contentLanguages: ["en", "fa"] },
    },
    ...overrides,
  };
}

function renderHistory(locale: "en" | "fa", versions: readonly ContentDnaVersionDto[]) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fa}>
      <ContentDnaHistory locale={locale} versions={versions} />
    </NextIntlClientProvider>,
  );
}

function renderDetail(locale: "en" | "fa", data: ContentDnaVersionDto) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fa}>
      <ContentDnaVersionDetail locale={locale} version={data} />
    </NextIntlClientProvider>,
  );
}

describe("Content DNA history presentation", () => {
  afterEach(cleanup);

  it("renders every version newest first with its own current marker and readiness", () => {
    const oldest = version({ versionNumber: 1, readiness: "INCOMPLETE" });
    const newest = version({
      id: "22222222-2222-4222-8222-222222222222",
      versionNumber: 2,
      readiness: "AI_READY",
      isCurrent: true,
    });

    renderHistory("en", [newest, oldest]);

    const links = screen.getAllByRole("link", { name: /Version [12]/ });
    expect(links.map((link) => link.querySelector("h3")?.textContent)).toEqual([
      "Version 2",
      "Version 1",
    ]);
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.getByText("AI-ready")).toBeTruthy();
    expect(screen.getByText("Incomplete")).toBeTruthy();
  });

  it("gives a single incomplete version the same read-only treatment", () => {
    renderHistory("en", [version()]);

    expect(screen.getByRole("link", { name: /Version 1/ })).toBeTruthy();
    expect(screen.getByText("Incomplete")).toBeTruthy();
    expect(screen.queryByText("Current")).toBeNull();
  });

  it("has a useful empty state for Content DNA that has not been created", () => {
    renderHistory("en", []);

    expect(screen.getByText("No saved versions yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Content DNA editor" })).toBeTruthy();
  });

  it("shows stored mixed-language values and content-language preferences independently of English UI", () => {
    renderDetail("en", version());

    expect(screen.getByText("English + فارسی creator context")).toBeTruthy();
    expect(screen.getAllByText("English")).toHaveLength(2);
    expect(screen.getByText("Persian")).toBeTruthy();
  });

  it("renders Persian labels with RTL-safe, unchanged creator content", () => {
    renderDetail("fa", version({ isCurrent: true, readiness: "AI_READY" }));

    expect(screen.getByRole("heading", { name: "نسخهٔ 1" })).toBeTruthy();
    expect(screen.getByText("آماده برای هوش مصنوعی")).toBeTruthy();
    expect(screen.getByText("English + فارسی creator context")).toBeTruthy();
    expect(screen.getAllByText("انگلیسی")).toHaveLength(2);
    expect(screen.getByText("فعلی")).toBeTruthy();
  });

  it("presents omitted optional data clearly without historical mutation actions", () => {
    renderDetail("en", version({ payload: { schemaVersion: 1 } }));

    expect(screen.getAllByText("Not provided").length).toBeGreaterThan(1);
    for (const unsupportedAction of ["Edit", "Restore", "Fork", "Delete", "Diff", "Duplicate"]) {
      expect(screen.queryByRole("button", { name: new RegExp(unsupportedAction, "i") })).toBeNull();
    }
  });
});
