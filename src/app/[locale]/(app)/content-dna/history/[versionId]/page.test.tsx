import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
vi.mock("@/lib/auth/server", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/modules/workspace/application", () => ({
  getOrCreateDefaultWorkspace: mocks.getOrCreateDefaultWorkspace,
}));
vi.mock("@/modules/dna/application", () => ({ getContentDnaVersion: mocks.getContentDnaVersion }));
vi.mock("@/modules/dna/presentation/content-dna-history", () => ({
  ContentDnaVersionDetail: () => null,
}));

import ContentDnaVersionDetailPage from "./page";

describe("Content DNA version detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getOrCreateDefaultWorkspace.mockResolvedValue({ id: "workspace-1" });
  });

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
});
