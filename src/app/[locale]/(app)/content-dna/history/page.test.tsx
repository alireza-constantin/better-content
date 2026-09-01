// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getOrCreateDefaultWorkspace: vi.fn(),
  listContentDnaVersions: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/auth/server", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/modules/workspace/application", () => ({
  getOrCreateDefaultWorkspace: mocks.getOrCreateDefaultWorkspace,
}));
vi.mock("@/modules/dna/application", () => ({
  listContentDnaVersions: mocks.listContentDnaVersions,
}));
vi.mock("@/modules/dna/presentation/content-dna-history", () => ({
  ContentDnaHistory: ({
    locale,
    versions,
  }: {
    locale: string;
    versions: readonly { id: string }[];
  }) => (
    <div data-locale={locale} data-testid="history-view">
      {versions.map(({ id }) => id)}
    </div>
  ),
}));

import ContentDnaHistoryPage from "./page";

describe("Content DNA history route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getOrCreateDefaultWorkspace.mockResolvedValue({ id: "workspace-1" });
    mocks.listContentDnaVersions.mockResolvedValue([{ id: "version-1" }]);
  });

  afterEach(cleanup);

  it("loads history through the read service and passes the authenticated workspace boundary to the view", async () => {
    const result = await ContentDnaHistoryPage({
      params: Promise.resolve({ locale: "fa" }),
    });
    render(result);

    expect(mocks.listContentDnaVersions).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
    const historyView = screen.getByTestId("history-view");
    expect(historyView.getAttribute("data-locale")).toBe("fa");
    expect(historyView.textContent).toContain("version-1");
  });

  it("does not query history when there is no authenticated session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    await expect(
      ContentDnaHistoryPage({ params: Promise.resolve({ locale: "en" }) }),
    ).resolves.toBeNull();

    expect(mocks.getOrCreateDefaultWorkspace).not.toHaveBeenCalled();
    expect(mocks.listContentDnaVersions).not.toHaveBeenCalled();
  });
});
