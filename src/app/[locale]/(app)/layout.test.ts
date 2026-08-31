import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getOrCreateDefaultWorkspace: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  applicationShell: vi.fn(() => null),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: mocks.redirect,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock("@/lib/auth/server", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/modules/workspace/application", () => ({
  getOrCreateDefaultWorkspace: mocks.getOrCreateDefaultWorkspace,
}));

vi.mock("@/components/shell/application-shell", () => ({
  ApplicationShell: mocks.applicationShell,
}));

import ProtectedApplicationLayout from "./layout";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("protected application layout", () => {
  it.each(["en", "fa"] as const)(
    "redirects unauthenticated /%s/dashboard access to its localized sign-in route",
    async (locale) => {
      mocks.getServerSession.mockResolvedValue(null);

      await expect(
        ProtectedApplicationLayout({ children: null, params: Promise.resolve({ locale }) }),
      ).rejects.toThrow(`redirect:/${locale}/sign-in`);

      expect(mocks.getOrCreateDefaultWorkspace).not.toHaveBeenCalled();
    },
  );

  it("provisions the authenticated user's workspace before rendering the dashboard shell", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Creator",
        email: "creator@example.com",
      },
    });
    mocks.getOrCreateDefaultWorkspace.mockResolvedValue({
      id: "workspace-1",
      name: "Personal workspace",
    });

    const result = await ProtectedApplicationLayout({
      children: null,
      params: Promise.resolve({ locale: "en" }),
    });

    expect(mocks.getOrCreateDefaultWorkspace).toHaveBeenCalledWith("user-1");
    expect(result.props).toMatchObject(
      expect.objectContaining({
        userEmail: "creator@example.com",
        userName: "Creator",
        workspaceContext: "personalWorkspace",
      }),
    );
  });
});
