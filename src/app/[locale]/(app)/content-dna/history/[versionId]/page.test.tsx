// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getOrCreateDefaultWorkspace: vi.fn(),
  getContentDnaVersion: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/auth/server", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/modules/workspace/application", () => ({
  getOrCreateDefaultWorkspace: mocks.getOrCreateDefaultWorkspace,
}));
vi.mock("@/modules/dna/application", () => ({ getContentDnaVersion: mocks.getContentDnaVersion }));
vi.mock("@/modules/dna/presentation/content-dna-history", () => ({
  ContentDnaVersionDetail: ({
    locale,
    version,
  }: {
    locale: string;
    version: { id: string; versionNumber: number };
  }) => (
    <article data-locale={locale} data-testid="version-detail">
      {version.id}:{version.versionNumber}
    </article>
  ),
}));

import ContentDnaVersionDetailPage from "./page";

describe("Content DNA version detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getOrCreateDefaultWorkspace.mockResolvedValue({ id: "workspace-1" });
  });

  afterEach(cleanup);

  it("turns an inaccessible or nonexistent version into a not-found response without rendering it", async () => {
    mocks.getContentDnaVersion.mockRejectedValue(new ApplicationError("NOT_FOUND", "not found"));

    await expect(
      ContentDnaVersionDetailPage({
        params: Promise.resolve({
          locale: "en",
          versionId: "11111111-1111-4111-8111-111111111111",
        }),
      }),
    ).rejects.toThrow("not-found");

    expect(mocks.getContentDnaVersion).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      versionId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("loads an authorized version through the read service and passes it to the read-only detail view", async () => {
    const version = { id: "version-1", versionNumber: 3 };
    mocks.getContentDnaVersion.mockResolvedValue(version);

    const result = await ContentDnaVersionDetailPage({
      params: Promise.resolve({
        locale: "fa",
        versionId: "11111111-1111-4111-8111-111111111111",
      }),
    });
    render(result);

    expect(mocks.getContentDnaVersion).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      versionId: "11111111-1111-4111-8111-111111111111",
    });
    const detailView = screen.getByTestId("version-detail");
    expect(detailView.getAttribute("data-locale")).toBe("fa");
    expect(detailView.textContent).toContain("version-1:3");
  });
});
