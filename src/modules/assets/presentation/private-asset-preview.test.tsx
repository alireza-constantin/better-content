// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../application/asset-capability-actions", () => ({
  issueAssetCapabilityAction: vi.fn(),
}));

import {
  PrivateAssetAudioPreview,
  PrivateAssetDownloadButton,
  PrivateAssetImagePreview,
  PrivateAssetVideoPreview,
} from "./private-asset-preview";
import { issueAssetCapabilityAction } from "../application/asset-capability-actions";

const messages = {
  Assets: {
    loading: "Loading media…",
    accessError: "Unavailable",
    retry: "Retry",
    download: "Download",
  },
};
const renderAsset = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("private Asset previews", () => {
  it("loads an image capability lazily in component memory and retries after a media error", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue({
      url: "https://private.test/image?token=x",
      expiresAt: new Date(Date.now() + 900_000),
    });
    renderAsset(
      <PrivateAssetImagePreview alt="Cover" width={640} height={480} requestCapability={request} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("img", { name: "Cover" })).not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.error(screen.getByRole("img", { name: "Cover" }));
    expect(screen.getByRole("alert").textContent).toContain("Unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await act(async () => {});
    expect(screen.getByRole("img", { name: "Cover" })).not.toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("uses the authenticated server action when given only an Asset identity", async () => {
    vi.useFakeTimers();
    const action = vi.mocked(issueAssetCapabilityAction).mockResolvedValue({
      url: "https://private.test/image?token=x",
      expiresAt: new Date(Date.now() + 900_000),
    });
    renderAsset(
      <PrivateAssetImagePreview
        asset={{
          workspaceId: "00000000-0000-4000-8000-000000000001",
          assetId: "00000000-0000-4000-8000-000000000002",
        }}
        alt="Cover"
        width={640}
        height={480}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(action).toHaveBeenCalledWith({
      workspaceId: "00000000-0000-4000-8000-000000000001",
      assetId: "00000000-0000-4000-8000-000000000002",
      operation: "PREVIEW",
    });
    expect(screen.getByRole("img", { name: "Cover" })).not.toBeNull();
  });

  it("uses native media and refreshes only while active", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue({
      url: "https://private.test/video?token=x",
      expiresAt: new Date(Date.now() + 900_000),
    });
    const { unmount } = renderAsset(
      <PrivateAssetVideoPreview label="Video" requestCapability={request} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByLabelText("Video").tagName).toBe("VIDEO");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(810_000);
    });
    expect(request.mock.calls.length).toBeGreaterThanOrEqual(2);
    unmount();
    const calls = request.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900_000);
    });
    expect(request).toHaveBeenCalledTimes(calls);
  });

  it("uses native audio", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue({
      url: "https://private.test/audio",
      expiresAt: new Date(Date.now() + 900_000),
    });
    renderAsset(
      <PrivateAssetAudioPreview label="Audio" requestCapability={request} active={false} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByLabelText("Audio").tagName).toBe("AUDIO");
  });

  it("stops automatic refresh after a failed media refresh until a user retries", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        url: "https://private.test/video-1",
        expiresAt: new Date(Date.now() + 900_000),
      })
      .mockRejectedValueOnce(new Error())
      .mockResolvedValueOnce({
        url: "https://private.test/video-2",
        expiresAt: new Date(Date.now() + 900_000),
      });
    renderAsset(<PrivateAssetVideoPreview label="Video" requestCapability={request} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(810_000);
    });
    expect(screen.getByRole("alert").textContent).toContain("Unavailable");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_600_000);
    });
    expect(request).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await act(async () => {});
    expect(screen.getByLabelText("Video")).not.toBeNull();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("restores practical playback state after replacing a video capability", async () => {
    vi.useFakeTimers();
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        url: "https://private.test/video-1",
        expiresAt: new Date(Date.now() + 900_000),
      })
      .mockResolvedValueOnce({
        url: "https://private.test/video-2",
        expiresAt: new Date(Date.now() + 900_000),
      });
    renderAsset(<PrivateAssetVideoPreview label="Video" requestCapability={request} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const video = screen.getByLabelText("Video") as HTMLVideoElement;
    Object.defineProperty(video, "paused", { configurable: true, value: false });
    video.currentTime = 42;
    video.volume = 0.4;
    video.muted = true;
    video.playbackRate = 1.25;
    fireEvent.timeUpdate(video);
    fireEvent.volumeChange(video);
    fireEvent.rateChange(video);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(810_000);
    });
    fireEvent.loadedMetadata(screen.getByLabelText("Video"));
    expect(video.currentTime).toBe(42);
    expect(video.volume).toBe(0.4);
    expect(video.muted).toBe(true);
    expect(video.playbackRate).toBe(1.25);
    expect(play).toHaveBeenCalled();
  });

  it("requests a fresh download capability for every user click", async () => {
    const onNavigate = vi.fn();
    const request = vi.fn().mockResolvedValue({
      url: "https://private.test/download?token=x",
      expiresAt: new Date(Date.now() + 900_000),
    });
    renderAsset(<PrivateAssetDownloadButton requestCapability={request} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await act(async () => {});
    expect(request).toHaveBeenNthCalledWith(1, "DOWNLOAD");
    expect(request).toHaveBeenNthCalledWith(2, "DOWNLOAD");
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });
});
