// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getOrCreateDefaultWorkspace: vi.fn(),
  getTranslations: vi.fn(),
  listContent: vi.fn(),
}));

vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));
vi.mock("@/lib/auth/server", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/modules/workspace/application", () => ({
  getOrCreateDefaultWorkspace: mocks.getOrCreateDefaultWorkspace,
}));
vi.mock("@/modules/content/application", () => ({ listContent: mocks.listContent }));
vi.mock("@/modules/content/presentation/content-list", () => ({
  ContentList: (props: { locale: string; content: readonly unknown[] }) => (
    <div
      data-content-count={props.content.length}
      data-locale={props.locale}
      data-testid="content-list"
    />
  ),
}));

import ContentPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTranslations.mockResolvedValue((key: string) => key);
  mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.getOrCreateDefaultWorkspace.mockResolvedValue({ id: "workspace-1" });
  mocks.listContent.mockResolvedValue([
    {
      id: "content-1",
      sourceIdeaTitle: "Idea title",
      format: "SHORT_VIDEO",
      contentLanguage: "fa",
      lastEditedAt: new Date("2026-09-01T10:00:00.000Z"),
    },
  ]);
});

afterEach(cleanup);

describe("Content route", () => {
  it("loads the authorized workspace DTO and passes the route locale to presentation", async () => {
    const result = await ContentPage({
      params: Promise.resolve({ locale: "fa" }),
    });
    render(result);

    expect(mocks.getTranslations).toHaveBeenCalledWith("Content");
    expect(mocks.getOrCreateDefaultWorkspace).toHaveBeenCalledWith("user-1");
    expect(mocks.listContent).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
    expect(screen.getByTestId("content-list").getAttribute("data-locale")).toBe("fa");
    expect(screen.getByTestId("content-list").getAttribute("data-content-count")).toBe("1");
  });

  it("does not provision a workspace or query private Content without a session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    await expect(ContentPage({ params: Promise.resolve({ locale: "en" }) })).resolves.toBeNull();

    expect(mocks.getOrCreateDefaultWorkspace).not.toHaveBeenCalled();
    expect(mocks.listContent).not.toHaveBeenCalled();
  });
});
