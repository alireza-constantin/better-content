// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getOrCreateDefaultWorkspace: vi.fn(),
  getTranslations: vi.fn(),
  getContentDetail: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/lib/auth/server", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/modules/workspace/application", () => ({
  getOrCreateDefaultWorkspace: mocks.getOrCreateDefaultWorkspace,
}));
vi.mock("@/modules/content/application", () => ({
  getContentDetail: mocks.getContentDetail,
}));
vi.mock("@/modules/content/presentation/content-editor", () => ({
  ContentEditor: (props: { content: { id: string }; workspaceId: string }) => (
    <div
      data-content-id={props.content.id}
      data-testid="content-editor"
      data-workspace-id={props.workspaceId}
    />
  ),
}));

import ContentDetailPage from "./page";

const content = {
  id: "content-1",
  sourceIdea: { id: "idea-1", title: "Idea title" },
  contentLanguage: "en" as const,
  format: "SHORT_VIDEO" as const,
  draft: {
    document: { schemaVersion: 1 as const, script: { text: "Script" } },
    revision: 2,
    updatedAt: new Date("2026-09-01T10:00:00.000Z"),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTranslations.mockResolvedValue((key: string) => key);
  mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.getOrCreateDefaultWorkspace.mockResolvedValue({ id: "workspace-1" });
  mocks.getContentDetail.mockResolvedValue(content);
  mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

afterEach(cleanup);

describe("Content detail route", () => {
  it("loads the authorized detail DTO and hands it to the client editor", async () => {
    const result = await ContentDetailPage({
      params: Promise.resolve({ locale: "en", contentId: "content-1" }),
    });
    render(result);

    expect(mocks.getOrCreateDefaultWorkspace).toHaveBeenCalledWith("user-1");
    expect(mocks.getContentDetail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contentId: "content-1",
    });
    expect(screen.getByTestId("content-editor").getAttribute("data-content-id")).toBe("content-1");
    expect(screen.getByTestId("content-editor").getAttribute("data-workspace-id")).toBe(
      "workspace-1",
    );
  });

  it("maps an authorized missing detail to the localized not-found boundary", async () => {
    mocks.getContentDetail.mockRejectedValueOnce(new ApplicationError("NOT_FOUND", "missing"));

    await expect(
      ContentDetailPage({
        params: Promise.resolve({ locale: "en", contentId: "missing" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("does not provision a workspace or query private detail without a session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    await expect(
      ContentDetailPage({
        params: Promise.resolve({ locale: "en", contentId: "content-1" }),
      }),
    ).resolves.toBeNull();

    expect(mocks.getOrCreateDefaultWorkspace).not.toHaveBeenCalled();
    expect(mocks.getContentDetail).not.toHaveBeenCalled();
  });
});
