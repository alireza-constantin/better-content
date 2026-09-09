// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getOrCreateDefaultWorkspace: vi.fn(),
  getTranslations: vi.fn(),
  getEditGuide: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/lib/auth/server", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/modules/workspace/application", () => ({
  getOrCreateDefaultWorkspace: mocks.getOrCreateDefaultWorkspace,
}));
vi.mock("@/modules/content/application", () => ({ getEditGuide: mocks.getEditGuide }));
vi.mock("@/modules/content/presentation/edit-guide", () => ({
  EditGuide: (props: { editGuide: { contentId: string }; locale: string; workspaceId: string }) => (
    <div
      data-content-id={props.editGuide.contentId}
      data-locale={props.locale}
      data-testid="ready"
      data-workspace-id={props.workspaceId}
    />
  ),
}));

import EditGuidePage from "./page";

const ready = {
  status: "READY" as const,
  contentId: "content-1",
  contentTitle: "A script",
  contentLanguage: "en" as const,
  acceptedVersionId: "version-1",
  acceptedVersionNumber: 1,
  scriptBlocks: [],
  assetPresentations: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTranslations.mockResolvedValue((key: string) => key);
  mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.getOrCreateDefaultWorkspace.mockResolvedValue({ id: "workspace-1" });
  mocks.getEditGuide.mockResolvedValue(ready);
  mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

afterEach(cleanup);

describe("Edit Guide route", () => {
  it("loads the authorized current accepted-Version result", async () => {
    const result = await EditGuidePage({
      params: Promise.resolve({ locale: "en", contentId: "content-1" }),
    });
    render(result);

    expect(mocks.getEditGuide).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contentId: "content-1",
    });
    expect(screen.getByTestId("ready").getAttribute("data-locale")).toBe("en");
  });

  it("renders accept-first guidance without a Draft-backed fallback", async () => {
    mocks.getEditGuide.mockResolvedValue({
      status: "NO_ACCEPTED_VERSION",
      contentId: "content-1",
      contentTitle: "A script",
      contentLanguage: "en",
      acceptedVersionId: null,
    });
    const result = await EditGuidePage({
      params: Promise.resolve({ locale: "en", contentId: "content-1" }),
    });
    render(result);

    expect(screen.getByRole("heading", { name: "noAcceptedTitle" })).toBeTruthy();
    expect(screen.queryByText("A script")).toBeNull();
  });

  it("keeps foreign or invalid route reads nondisclosing", async () => {
    mocks.getEditGuide.mockRejectedValueOnce(new ApplicationError("NOT_FOUND", "missing"));

    await expect(
      EditGuidePage({
        params: Promise.resolve({ locale: "en", contentId: "foreign" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("does not provision a workspace or read private content without a session", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    await expect(
      EditGuidePage({
        params: Promise.resolve({ locale: "fa", contentId: "content-1" }),
      }),
    ).resolves.toBeNull();
    expect(mocks.getOrCreateDefaultWorkspace).not.toHaveBeenCalled();
    expect(mocks.getEditGuide).not.toHaveBeenCalled();
  });
});
