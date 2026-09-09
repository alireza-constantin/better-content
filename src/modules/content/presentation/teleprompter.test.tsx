// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import type { ContentTeleprompterResult } from "../application";

vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

import { Teleprompter } from "./teleprompter";

const content: Extract<ContentTeleprompterResult, { status: "READY" }> = {
  status: "READY",
  contentId: "content-1",
  contentTitle: "Mixed direction studio script",
  contentLanguage: "fa",
  acceptedVersionId: "version-1",
  acceptedVersionNumber: 2,
  scriptBlocks: [
    {
      id: "block-1",
      text: "سلام creator — First block",
      performanceHints: [
        { id: "hint-1", type: "PAUSE", values: ["short"] },
        { id: "hint-2", type: "EMPHASIS", values: ["strong"] },
        { id: "hint-3", type: "DELIVERY", values: ["warm", "slower"] },
        { id: "hint-4", type: "GESTURE", values: ["point"] },
        { id: "hint-5", type: "POSITION", values: ["stand"] },
        { id: "hint-6", type: "GAZE", values: ["camera"] },
        { id: "hint-7", type: "PERFORMANCE_NOTE", values: [], text: "با انرژی" },
      ],
    },
    { id: "block-2", text: "Second block", performanceHints: [] },
  ],
};

function renderTeleprompter(locale: "en" | "fa" = "en", value: typeof content = content) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "fa" ? fa : en}>
      <Teleprompter locale={locale} teleprompter={value} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Teleprompter", () => {
  it("renders Script in order, keeps hints semantic and omits Edit Directions", () => {
    renderTeleprompter();

    expect(screen.getByRole("main").getAttribute("dir")).toBe("ltr");
    expect(screen.getByRole("region", { name: "Spoken Script" })).toBeTruthy();
    expect(screen.getByText("سلام creator — First block")).toBeTruthy();
    expect(screen.getByText("Second block")).toBeTruthy();
    expect(screen.getAllByRole("note")).toHaveLength(1);
    expect(screen.getAllByText("Performance Hints").length).toBeGreaterThan(0);
    expect(screen.getByText("Performance note")).toBeTruthy();
    expect(screen.queryByText("Cut")).toBeNull();
  });

  it("hides only Performance Hints and preserves Script text", () => {
    renderTeleprompter();
    fireEvent.click(screen.getByRole("button", { name: "Hide Performance Hints" }));

    expect(
      screen.getByRole("button", { name: "Show Performance Hints" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByText("سلام creator — First block")).toBeTruthy();
  });

  it("provides bounded ephemeral controls and keyboard shortcuts", () => {
    renderTeleprompter();
    const speed = screen.getByRole("slider", { name: "Scroll speed" });
    const textSize = screen.getByRole("slider", { name: "Text size" });
    const width = screen.getByRole("slider", { name: "Reading width" });

    expect(speed.getAttribute("min")).toBe("0.25");
    expect(speed.getAttribute("max")).toBe("3");
    expect(textSize.getAttribute("min")).toBe("1");
    expect(textSize.getAttribute("max")).toBe("2.5");
    expect(width.getAttribute("min")).toBe("40");
    fireEvent.change(speed, { target: { value: "2.5" } });
    fireEvent.change(textSize, { target: { value: "2" } });
    fireEvent.change(width, { target: { value: "45" } });
    expect((speed as HTMLInputElement).value).toBe("2.5");
    expect((textSize as HTMLInputElement).value).toBe("2");
    expect((width as HTMLInputElement).value).toBe("45");

    fireEvent.keyDown(window, { key: "h" });
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.keyDown(window, { key: "+" });
    fireEvent.keyDown(window, { key: "]" });
    expect(
      screen.getByRole("button", { name: "Show Performance Hints" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: "Mirror reading surface" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("announces and cancels the countdown, and handles unsupported fullscreen", () => {
    vi.useFakeTimers();
    renderTeleprompter();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("Starting in 3")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("Paused")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    expect(screen.getByText("Fullscreen is not available in this browser.")).toBeTruthy();
  });

  it("derives progress from scroll metrics and restarts without persisting position", () => {
    renderTeleprompter("en");
    const surface = screen.getByTestId("teleprompter-reading-surface");
    Object.defineProperties(surface, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
    });
    (surface as HTMLDivElement).scrollTop = 50;
    fireEvent.scroll(surface);
    expect(screen.getByText("50% complete")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Restart from beginning" }));
    expect((surface as HTMLDivElement).scrollTop).toBe(0);
    expect(screen.getByText("0% complete")).toBeTruthy();
  });

  it("requests and releases a screen Wake Lock around active prompting", async () => {
    vi.useFakeTimers();
    const release = vi.fn(() => Promise.resolve());
    const sentinel = {
      release,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const request = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    });
    renderTeleprompter();
    fireEvent.click(screen.getByRole("button", { name: /^Start$/ }));
    await act(async () => {
      vi.advanceTimersByTime(3_000);
      await Promise.resolve();
    });
    expect(request).toHaveBeenCalledWith("screen");

    fireEvent.click(screen.getByRole("button", { name: /^Pause$/ }));
    expect(release).toHaveBeenCalledOnce();
  });

  it("synchronizes successful fullscreen entry through fullscreenchange", async () => {
    renderTeleprompter();
    const stage = screen.getByTestId("teleprompter");
    const requestFullscreen = vi.fn(async () => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: stage,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    Object.defineProperty(stage, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    await Promise.resolve();
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeTruthy();
  });

  it("uses explicit Persian RTL route semantics while leaving creator text unchanged", () => {
    renderTeleprompter("fa");
    expect(screen.getByRole("main").getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("main").getAttribute("lang")).toBe("fa");
    expect(screen.getByText("سلام creator — First block")).toBeTruthy();
    expect(screen.getByRole("button", { name: "آینه‌ای کردن سطح خواندن" })).toBeTruthy();
  });
});
