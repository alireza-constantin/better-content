// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getOrCreateDefaultWorkspace: vi.fn(),
  getTranslations: vi.fn(),
  getTeleprompter: vi.fn(),
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
vi.mock("@/modules/content/application", () => ({ getTeleprompter: mocks.getTeleprompter }));
vi.mock("@/modules/content/presentation/teleprompter", () => ({
  Teleprompter: (props: { teleprompter: { contentId: string }; locale: string }) => (
    <div
      data-content-id={props.teleprompter.contentId}
      data-locale={props.locale}
      data-testid="ready"
    />
  ),
}));

import TeleprompterPage from "./page";

const ready = {
  status: "READY" as const,
  contentId: "content-1",
  contentTitle: "A script",
  contentLanguage: "en" as const,
  acceptedVersionId: "version-1",
  acceptedVersionNumber: 1,
  scriptBlocks: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTranslations.mockResolvedValue((key: string) => key);
  mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.getOrCreateDefaultWorkspace.mockResolvedValue({ id: "workspace-1" });
  mocks.getTeleprompter.mockResolvedValue(ready);
  mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

afterEach(cleanup);

describe("Teleprompter route", () => {
  it("loads the authorized current accepted-Version result", async () => {
    const result = await TeleprompterPage({
      params: Promise.resolve({ locale: "en", contentId: "content-1" }),
    });
    render(result);

    expect(mocks.getTeleprompter).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contentId: "content-1",
    });
    expect(screen.getByTestId("ready").getAttribute("data-locale")).toBe("en");
  });

  it("renders localized guidance without a Draft-backed fallback", async () => {
    mocks.getTeleprompter.mockResolvedValue({
      status: "NO_ACCEPTED_VERSION",
      contentId: "content-1",
      contentTitle: "A script",
      contentLanguage: "en",
      acceptedVersionId: null,
    });
    const result = await TeleprompterPage({
      params: Promise.resolve({ locale: "en", contentId: "content-1" }),
    });
    render(result);

    expect(screen.getByRole("heading", { name: "noAcceptedTitle" })).toBeTruthy();
    expect(screen.queryByText("A script")).toBeNull();
  });

  it("keeps foreign or invalid route reads nondisclosing", async () => {
    mocks.getTeleprompter.mockRejectedValueOnce(new ApplicationError("NOT_FOUND", "missing"));

    await expect(
      TeleprompterPage({
        params: Promise.resolve({ locale: "en", contentId: "foreign" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });
});
