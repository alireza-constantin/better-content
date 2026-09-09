// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";

const mocks = vi.hoisted(() => ({
  getLibrary: vi.fn(),
}));

vi.mock("@/modules/assets/application/asset-library-actions", () => ({
  getAssetLibraryAction: mocks.getLibrary,
}));
vi.mock("@/modules/assets/presentation/asset-library-workspace", () => ({
  AssetCreationPanel: () => null,
}));
vi.mock("@/modules/assets/presentation/private-asset-preview", () => ({
  PrivateAssetAudioPreview: () => null,
  PrivateAssetImagePreview: () => null,
  PrivateAssetVideoPreview: () => null,
}));

import { DirectionAssetPicker } from "./direction-asset-picker";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const emptyLibrary = {
  page: 1,
  pageSize: 24,
  hasNextPage: false,
  search: "",
  mediaType: null,
  status: "READY" as const,
  assets: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DirectionAssetPicker", () => {
  it("loads the compatible library once when the picker opens", async () => {
    mocks.getLibrary.mockResolvedValue({ ok: true, value: emptyLibrary });

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DirectionAssetPicker
          workspaceId={workspaceId}
          directionType="BROLL_CUE"
          open
          onClose={vi.fn()}
          onUse={vi.fn()}
          onDetach={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    await screen.findByText("No compatible ready media found.");
    expect(mocks.getLibrary).toHaveBeenCalledTimes(1);
    expect(mocks.getLibrary).toHaveBeenCalledWith({
      workspaceId,
      page: 1,
      search: "",
      mediaTypes: ["IMAGE", "VIDEO"],
      status: "READY",
    });
  });
});
