// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import type { AssetLibraryDto, AssetLibraryItemDto } from "../application/asset-library-service";

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  createLink: vi.fn(),
  finalize: vi.fn(),
  getLibrary: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  rename: vi.fn(),
  image: vi.fn(),
  video: vi.fn(),
  audio: vi.fn(),
  download: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../application/asset-library-actions", () => ({
  beginAssetUploadAction: mocks.begin,
  createExternalAssetLinkAction: mocks.createLink,
  deleteAssetAction: mocks.delete,
  finalizeAssetUploadAction: mocks.finalize,
  getAssetLibraryAction: mocks.getLibrary,
  renameAssetAction: mocks.rename,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("./private-asset-preview", () => ({
  PrivateAssetImagePreview: (props: { alt: string }) => {
    mocks.image(props);
    return <span aria-label={props.alt} data-preview="image" />;
  },
  PrivateAssetVideoPreview: (props: { label: string }) => {
    mocks.video(props);
    return <video aria-label={props.label} controls />;
  },
  PrivateAssetAudioPreview: (props: { label: string }) => {
    mocks.audio(props);
    return <audio aria-label={props.label} controls />;
  },
  PrivateAssetDownloadButton: (props: unknown) => {
    mocks.download(props);
    return <button type="button">Download</button>;
  },
}));

import { AssetLibraryWorkspace } from "./asset-library-workspace";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const state = { page: 1, search: "", mediaType: null, status: null } as const;

function item(overrides: Partial<AssetLibraryItemDto> = {}): AssetLibraryItemDto {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    mediaType: "IMAGE",
    sourceType: "EXTERNAL_URL",
    status: "READY",
    displayName: "کاور Video",
    sourceHost: "media.example.test",
    byteSize: 1200,
    width: 100,
    height: 80,
    durationMs: null,
    mediaFormat: "JPEG",
    failureCode: null,
    createdAt: new Date("2026-09-08T00:00:00Z"),
    updatedAt: new Date("2026-09-08T00:00:00Z"),
    referenceCount: 2,
    ...overrides,
  };
}

function library(assets: readonly AssetLibraryItemDto[]): AssetLibraryDto {
  return { ...state, pageSize: 24, hasNextPage: false, assets };
}

function renderWorkspace(locale: "en" | "fa", assets: readonly AssetLibraryItemDto[]) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fa}>
      <AssetLibraryWorkspace
        workspaceId={workspaceId}
        initialLibrary={library(assets)}
        initialUrlState={state}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Workspace Asset Library", () => {
  it("presents safe READY metadata and bidi-isolated source host without source URL", () => {
    renderWorkspace("en", [item()]);
    expect(screen.getByText("Referenced in 2 contents")).not.toBeNull();
    expect(screen.getByText(/media\.example\.test/u)).not.toBeNull();
    expect(document.body.textContent).not.toContain("https://media.example.test");
    expect(document.querySelector("bdi")?.getAttribute("dir")).toBe("auto");
  });

  it("defers the READY image primitive until its card is visible", () => {
    let callback: IntersectionObserverCallback | undefined;
    class IntersectionObserverMock {
      constructor(next: IntersectionObserverCallback) {
        callback = next;
      }

      disconnect() {}

      observe() {}
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    renderWorkspace("en", [item()]);
    expect(mocks.image).not.toHaveBeenCalled();
    act(() =>
      callback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(mocks.image).toHaveBeenLastCalledWith(
      expect.objectContaining({ asset: { workspaceId, assetId: item().id } }),
    );
  });

  it("round-trips filter and search controls through the router URL", () => {
    renderWorkspace("en", [item()]);
    fireEvent.change(screen.getByLabelText("Search media"), { target: { value: "cover" } });
    fireEvent.submit(screen.getByLabelText("Search media").closest("form")!);
    expect(mocks.push).toHaveBeenCalledWith("/assets?q=cover");
    fireEvent.change(document.querySelector('select[aria-label="Media type"]')!, {
      target: { value: "IMAGE" },
    });
    expect(mocks.push).toHaveBeenLastCalledWith("/assets?type=IMAGE");
  });

  it("polls active lifecycle every five seconds and tears down on unmount", async () => {
    vi.useFakeTimers();
    mocks.getLibrary.mockResolvedValue({
      ok: true,
      value: library([item({ status: "PROCESSING" })]),
    });
    const { unmount } = renderWorkspace("en", [item({ status: "PENDING" })]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(mocks.getLibrary).toHaveBeenCalledWith({ workspaceId, ...state });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(mocks.getLibrary).toHaveBeenCalledTimes(1);
  });

  it("backs lifecycle polling off to fifteen seconds after one minute", async () => {
    vi.useFakeTimers();
    mocks.getLibrary.mockResolvedValue({ ok: true, value: library([item({ status: "PENDING" })]) });
    renderWorkspace("en", [item({ status: "PENDING" })]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(65_000);
    });
    expect(mocks.getLibrary).toHaveBeenCalledTimes(12);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(mocks.getLibrary).toHaveBeenCalledTimes(12);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.getLibrary).toHaveBeenCalledTimes(13);
  });

  it("wires one-file upload through the approved creation and finalization boundaries", async () => {
    const uploadUrl = "https://private-storage.test/put";
    mocks.begin.mockResolvedValue({
      ok: true,
      value: { assetId: item().id, capability: { url: uploadUrl } },
    });
    mocks.finalize.mockResolvedValue({ ok: true, value: {} });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    renderWorkspace("en", []);
    const file = new File(["bytes"], "cover.jpg", { type: "image/jpeg" });
    fireEvent.change(document.getElementById("upload-name")!, { target: { value: "Cover" } });
    fireEvent.change(document.getElementById("upload-file")!, { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: "Upload media" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.begin).toHaveBeenCalledWith({
        workspaceId,
        mediaType: "IMAGE",
        displayName: "Cover",
        originalFilename: "cover.jpg",
        expectedUploadSizeBytes: 5,
        browserMimeType: "image/jpeg",
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      uploadUrl,
      expect.objectContaining({ method: "PUT", body: file }),
    );
    await waitFor(() =>
      expect(mocks.finalize).toHaveBeenCalledWith({ workspaceId, assetId: item().id }),
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("wires a direct HTTPS link through the existing external-ingestion boundary", async () => {
    mocks.createLink.mockResolvedValue({ ok: true, value: { assetId: item().id } });
    renderWorkspace("en", []);
    fireEvent.change(document.getElementById("link-name")!, { target: { value: "Remote" } });
    fireEvent.change(document.getElementById("link-url")!, {
      target: { value: "https://media.example.test/video" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Add link" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.createLink).toHaveBeenCalledWith({
        workspaceId,
        mediaType: "IMAGE",
        displayName: "Remote",
        sourceUrl: "https://media.example.test/video",
      }),
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("uses Ticket 06 native preview/download primitives in a keyboard-accessible detail dialog", async () => {
    renderWorkspace("en", [item({ mediaType: "VIDEO", displayName: "Walkthrough" })]);
    fireEvent.click(screen.getByRole("button", { name: /Walkthrough/u }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("tabindex")).toBe("-1");
    expect(dialog.querySelector("video")).not.toBeNull();
    expect(mocks.video).toHaveBeenLastCalledWith(
      expect.objectContaining({ asset: { workspaceId, assetId: item().id } }),
    );
    expect(mocks.download).toHaveBeenLastCalledWith(
      expect.objectContaining({ asset: { workspaceId, assetId: item().id } }),
    );
    expect(screen.getByRole("button", { name: "Close" })).not.toBeNull();
  });

  it("uses the native audio primitive only after readiness and never offers capabilities to non-ready media", async () => {
    renderWorkspace("en", [item({ mediaType: "AUDIO", displayName: "Narration" })]);
    fireEvent.click(screen.getByRole("button", { name: /Narration/u }));
    await screen.findByRole("dialog");
    expect(mocks.audio).toHaveBeenLastCalledWith(
      expect.objectContaining({ asset: { workspaceId, assetId: item().id } }),
    );
    cleanup();
    vi.clearAllMocks();
    renderWorkspace("en", [item({ status: "PROCESSING", displayName: "Not ready" })]);
    fireEvent.click(screen.getByRole("button", { name: /Not ready/u }));
    await screen.findByRole("dialog");
    expect(mocks.image).not.toHaveBeenCalled();
    expect(mocks.video).not.toHaveBeenCalled();
    expect(mocks.audio).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("renames from the detail dialog through the server-authorized action", async () => {
    mocks.rename.mockResolvedValue({ ok: true, value: item({ displayName: "Renamed" }) });
    renderWorkspace("en", [item({ displayName: "Before" })]);
    fireEvent.click(screen.getByRole("button", { name: /Before/u }));
    await screen.findByRole("dialog");
    fireEvent.change(document.getElementById("asset-rename")!, { target: { value: "نام Video" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() =>
      expect(mocks.rename).toHaveBeenCalledWith({
        workspaceId,
        assetId: item().id,
        displayName: "نام Video",
      }),
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("confirms irreversible deletion and presents an in-use conflict without closing the detail", async () => {
    mocks.delete.mockResolvedValue({ ok: false, code: "ASSET_IN_USE" });
    renderWorkspace("en", [item({ displayName: "Referenced" })]);
    fireEvent.click(screen.getByRole("button", { name: /Referenced/u }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Delete media" }));
    expect(screen.getByRole("alertdialog")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() =>
      expect(mocks.delete).toHaveBeenCalledWith({ workspaceId, assetId: item().id }),
    );
    expect(
      screen.getByText("This media is still referenced by content and cannot be deleted."),
    ).not.toBeNull();
  });

  it("keeps a deleting asset visible but disables its mutation and capability controls", async () => {
    renderWorkspace("en", [item({ status: "DELETING", displayName: "Removing" })]);
    fireEvent.click(screen.getByRole("button", { name: /Removing/u }));
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Save name" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete media" })).toBeNull();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("shows all lifecycle labels and uses localized RTL controls", () => {
    renderWorkspace(
      "fa",
      statuses().map((status) => item({ id: crypto.randomUUID(), status })),
    );
    expect(screen.getAllByText("در انتظار").length).toBeGreaterThan(1);
    expect(screen.getAllByText("در حال پردازش").length).toBeGreaterThan(1);
    expect(screen.getAllByText("آماده").length).toBeGreaterThan(1);
    expect(screen.getAllByText("ناموفق").length).toBeGreaterThan(1);
    expect(screen.getAllByText("در حال حذف").length).toBeGreaterThan(1);
    expect(
      screen.getByRole("heading", { name: "رسانه‌ها" }).closest("section")?.getAttribute("dir"),
    ).toBe("rtl");
  });
});

function statuses() {
  return ["PENDING", "PROCESSING", "READY", "FAILED", "DELETING"] as const;
}
