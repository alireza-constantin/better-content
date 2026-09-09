"use client";

import {
  ArrowLeftIcon,
  ExpandIcon,
  GaugeIcon,
  Maximize2Icon,
  Minimize2Icon,
  MonitorPlayIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  Settings2Icon,
  ShrinkIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { ContentTeleprompterResult } from "../application";

type Props = Readonly<{
  locale: AppLocale;
  teleprompter: Extract<ContentTeleprompterResult, { status: "READY" }>;
}>;

type PlaybackState = "paused" | "countdown" | "playing" | "complete";
type WakeLockSentinelLike = Readonly<{
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
  removeEventListener?: (type: "release", listener: () => void) => void;
}>;
type WakeLockNavigator = Navigator & {
  wakeLock?: Readonly<{
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  }>;
};

const MIN_SPEED = 0.25;
const MAX_SPEED = 3;
const SPEED_STEP = 0.25;
const MIN_TEXT_SIZE = 1;
const MAX_TEXT_SIZE = 2.5;
const TEXT_SIZE_STEP = 0.1;
const MIN_LINE_WIDTH = 40;
const MAX_LINE_WIDTH = 70;
const LINE_WIDTH_STEP = 5;
const BASE_SCROLL_PIXELS_PER_SECOND = 42;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("button, input, select, textarea, [contenteditable=true]") !== null
  );
}

function formatNumber(value: number): string {
  return value
    .toFixed(2)
    .replace(/\.00$/u, "")
    .replace(/(\.\d)0$/u, "$1");
}

function scrollToPosition(surface: HTMLElement, top: number, reducedMotion: boolean): void {
  try {
    surface.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });
  } catch {
    surface.scrollTop = top;
  }
}

export function Teleprompter({ locale, teleprompter }: Props) {
  const t = useTranslations("Teleprompter");
  const contentT = useTranslations("Content");
  const stageRef = useRef<HTMLElement>(null);
  const readingSurfaceRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const animationUsesTimeoutRef = useRef(false);
  const countdownTimerRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const lastAutoScrollTopRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const wakeLockReleaseListenerRef = useRef<(() => void) | null>(null);
  const playbackStateRef = useRef<PlaybackState>("paused");
  const runFrameRef = useRef<((now: number) => void) | null>(null);
  const scheduleCountdownRef = useRef<((value: number) => void) | null>(null);
  const speedRef = useRef(1);
  const mountedRef = useRef(true);

  const [playbackState, setPlaybackState] = useState<PlaybackState>("paused");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const [textSize, setTextSize] = useState(1.4);
  const [lineWidth, setLineWidth] = useState(60);
  const [hintsVisible, setHintsVisible] = useState(true);
  const [mirror, setMirror] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const updateProgress = useCallback(() => {
    const surface = readingSurfaceRef.current;
    if (!surface) return;
    const range = surface.scrollHeight - surface.clientHeight;
    const next = range > 0 ? Math.round(clamp(surface.scrollTop / range, 0, 1) * 100) : 0;
    setProgress((current) => (current === next ? current : next));
  }, []);

  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current === null) return;
    if (animationUsesTimeoutRef.current) window.clearTimeout(animationFrameRef.current);
    else window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    lastFrameTimeRef.current = null;
  }, []);

  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockRef.current;
    const onRelease = wakeLockReleaseListenerRef.current;
    wakeLockRef.current = null;
    wakeLockReleaseListenerRef.current = null;
    if (sentinel && onRelease) sentinel.removeEventListener?.("release", onRelease);
    if (sentinel) void sentinel.release().catch(() => undefined);
  }, []);

  const requestWakeLock = useCallback(async () => {
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock || wakeLockRef.current || playbackStateRef.current !== "playing") return;

    try {
      const sentinel = await wakeLock.request("screen");
      if (!mountedRef.current || playbackStateRef.current !== "playing") {
        await sentinel.release().catch(() => undefined);
        return;
      }
      const onRelease = () => {
        wakeLockRef.current = null;
        wakeLockReleaseListenerRef.current = null;
        if (playbackStateRef.current === "playing" && mountedRef.current) {
          setStatusMessage(t("wakeLockUnavailable"));
        }
      };
      sentinel.addEventListener("release", onRelease);
      wakeLockReleaseListenerRef.current = onRelease;
      wakeLockRef.current = sentinel;
    } catch {
      setStatusMessage(t("wakeLockUnavailable"));
    }
  }, [t]);

  const completePlayback = useCallback(() => {
    cancelAnimation();
    releaseWakeLock();
    playbackStateRef.current = "complete";
    setPlaybackState("complete");
    setProgress(100);
    setStatusMessage(t("statusComplete"));
  }, [cancelAnimation, releaseWakeLock, t]);

  const scheduleFrame = useCallback((callback: FrameRequestCallback) => {
    if (typeof window.requestAnimationFrame === "function") {
      animationUsesTimeoutRef.current = false;
      return window.requestAnimationFrame(callback);
    }
    animationUsesTimeoutRef.current = true;
    return window.setTimeout(() => callback(performance.now()), 16);
  }, []);

  const runFrame = useCallback(
    (now: number) => {
      if (!mountedRef.current || playbackStateRef.current !== "playing") return;
      const surface = readingSurfaceRef.current;
      if (!surface) return;
      const previous = lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      const elapsedSeconds = previous === null ? 0 : Math.min(now - previous, 100) / 1000;
      const maxScrollTop = surface.scrollHeight - surface.clientHeight;
      if (maxScrollTop <= 0 || surface.scrollTop >= maxScrollTop - 1) {
        surface.scrollTop = maxScrollTop;
        updateProgress();
        completePlayback();
        return;
      }
      const nextScrollTop = Math.min(
        maxScrollTop,
        surface.scrollTop + elapsedSeconds * BASE_SCROLL_PIXELS_PER_SECOND * speedRef.current,
      );
      lastAutoScrollTopRef.current = nextScrollTop;
      surface.scrollTop = nextScrollTop;
      updateProgress();
      if (nextScrollTop >= maxScrollTop - 1) {
        surface.scrollTop = maxScrollTop;
        updateProgress();
        completePlayback();
        return;
      }
      animationFrameRef.current = scheduleFrame((timestamp) => runFrameRef.current?.(timestamp));
    },
    [completePlayback, scheduleFrame, updateProgress],
  );

  const startAutoScroll = useCallback(() => {
    cancelAnimation();
    setCountdown(null);
    playbackStateRef.current = "playing";
    setPlaybackState("playing");
    setStatusMessage(t("statusPlaying"));
    lastFrameTimeRef.current = null;
    runFrameRef.current = runFrame;
    animationFrameRef.current = scheduleFrame((timestamp) => runFrameRef.current?.(timestamp));
    void requestWakeLock();
  }, [cancelAnimation, requestWakeLock, runFrame, scheduleFrame, t]);

  const clearCountdownTimer = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const cancelCountdown = useCallback(() => {
    clearCountdownTimer();
    setCountdown(null);
  }, [clearCountdownTimer]);

  const scheduleCountdown = useCallback(
    (value: number) => {
      playbackStateRef.current = "countdown";
      setCountdown(value);
      setPlaybackState("countdown");
      setStatusMessage(t("countdown", { count: value }));
      countdownTimerRef.current = window.setTimeout(() => {
        countdownTimerRef.current = null;
        if (!mountedRef.current || playbackStateRef.current !== "countdown") return;
        if (value > 1) scheduleCountdownRef.current?.(value - 1);
        else startAutoScroll();
      }, 1000);
    },
    [startAutoScroll, t],
  );

  const pausePlayback = useCallback(() => {
    cancelAnimation();
    cancelCountdown();
    releaseWakeLock();
    if (playbackStateRef.current !== "complete") {
      playbackStateRef.current = "paused";
      setPlaybackState("paused");
      setStatusMessage(t("statusPaused"));
    }
  }, [cancelAnimation, cancelCountdown, releaseWakeLock, t]);

  const togglePlayback = useCallback(() => {
    if (playbackStateRef.current === "playing" || playbackStateRef.current === "countdown") {
      pausePlayback();
      return;
    }
    scheduleCountdownRef.current = scheduleCountdown;
    scheduleCountdown(3);
  }, [pausePlayback, scheduleCountdown]);

  const restart = useCallback(() => {
    pausePlayback();
    const surface = readingSurfaceRef.current;
    if (surface) {
      lastAutoScrollTopRef.current = 0;
      scrollToPosition(surface, 0, reducedMotion);
      if (surface.scrollTop !== 0) surface.scrollTop = 0;
    }
    setProgress(0);
    setStatusMessage(t("statusPaused"));
  }, [pausePlayback, reducedMotion, t]);

  const moveManually = useCallback(
    (amount: number) => {
      pausePlayback();
      const surface = readingSurfaceRef.current;
      if (!surface) return;
      const next = clamp(
        surface.scrollTop + amount,
        0,
        surface.scrollHeight - surface.clientHeight,
      );
      scrollToPosition(surface, next, reducedMotion);
      updateProgress();
    },
    [pausePlayback, reducedMotion, updateProgress],
  );

  const toggleFullscreen = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage || typeof document === "undefined") return;
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        setStatusMessage(t("fullscreenFailed"));
      }
      return;
    }
    if (!stage.requestFullscreen) {
      setStatusMessage(t("fullscreenUnavailable"));
      return;
    }
    try {
      await stage.requestFullscreen();
    } catch {
      setStatusMessage(t("fullscreenFailed"));
    }
  }, [t]);

  useEffect(() => {
    const surface = readingSurfaceRef.current;
    if (!surface) return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.("change", update);
    return () => mediaQuery.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", update);
    update();
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && playbackStateRef.current === "playing") {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [requestWakeLock]);

  useEffect(() => {
    if (typeof window.requestAnimationFrame === "function") {
      const frame = window.requestAnimationFrame(updateProgress);
      return () => window.cancelAnimationFrame(frame);
    }
    const frame = window.setTimeout(updateProgress, 0);
    return () => window.clearTimeout(frame);
  }, [hintsVisible, lineWidth, textSize, updateProgress]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelAnimation();
      clearCountdownTimer();
      releaseWakeLock();
    };
  }, [cancelAnimation, clearCountdownTimer, releaseWakeLock]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isInteractiveTarget(event.target)) return;
      const key = event.key;
      if (key === "Escape") {
        if (playbackStateRef.current === "countdown") {
          cancelCountdown();
          playbackStateRef.current = "paused";
          setPlaybackState("paused");
          setStatusMessage(t("statusPaused"));
        }
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        return;
      }
      if (key === " " || key.toLowerCase() === "k") {
        event.preventDefault();
        togglePlayback();
      } else if (key === "Home") {
        event.preventDefault();
        restart();
      } else if (key === "ArrowUp") {
        event.preventDefault();
        moveManually(-80);
      } else if (key === "ArrowDown") {
        event.preventDefault();
        moveManually(80);
      } else if (key === "PageUp") {
        event.preventDefault();
        moveManually(-(readingSurfaceRef.current?.clientHeight ?? 320) * 0.85);
      } else if (key === "PageDown") {
        event.preventDefault();
        moveManually((readingSurfaceRef.current?.clientHeight ?? 320) * 0.85);
      } else if (key.toLowerCase() === "h") {
        event.preventDefault();
        setHintsVisible((visible) => !visible);
      } else if (key.toLowerCase() === "m") {
        event.preventDefault();
        setMirror((enabled) => !enabled);
      } else if (key.toLowerCase() === "f") {
        event.preventDefault();
        void toggleFullscreen();
      } else if (key === "+" || key === "=") {
        event.preventDefault();
        setTextSize((value) =>
          clamp(Number((value + TEXT_SIZE_STEP).toFixed(1)), MIN_TEXT_SIZE, MAX_TEXT_SIZE),
        );
      } else if (key === "-") {
        event.preventDefault();
        setTextSize((value) =>
          clamp(Number((value - TEXT_SIZE_STEP).toFixed(1)), MIN_TEXT_SIZE, MAX_TEXT_SIZE),
        );
      } else if (key === "]") {
        event.preventDefault();
        setSpeed((value) => clamp(Number((value + SPEED_STEP).toFixed(2)), MIN_SPEED, MAX_SPEED));
      } else if (key === "[") {
        event.preventDefault();
        setSpeed((value) => clamp(Number((value - SPEED_STEP).toFixed(2)), MIN_SPEED, MAX_SPEED));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelCountdown, moveManually, restart, t, toggleFullscreen, togglePlayback]);

  function hintDetail(
    hint: (typeof teleprompter.scriptBlocks)[number]["performanceHints"][number],
  ) {
    if (hint.type === "PERFORMANCE_NOTE") return hint.text ?? "";
    return hint.values.map((value) => contentT(`directionValue${value}`)).join(" · ");
  }

  const playbackLabel =
    playbackState === "playing"
      ? t("pause")
      : playbackState === "countdown"
        ? t("cancelCountdown")
        : playbackState === "complete"
          ? t("start")
          : playbackState === "paused" && progress > 0
            ? t("resume")
            : t("start");
  const playbackIcon =
    playbackState === "playing" ? (
      <PauseIcon aria-hidden="true" />
    ) : (
      <PlayIcon aria-hidden="true" />
    );

  return (
    <main
      className="flex h-dvh min-h-[32rem] flex-col overflow-hidden bg-[#101418] text-[#f5f0e8] selection:bg-[#d9a441]/35"
      data-locale={locale}
      data-testid="teleprompter"
      dir={locale === "fa" ? "rtl" : "ltr"}
      lang={locale}
      ref={stageRef}
    >
      <header className="shrink-0 border-b border-white/10 bg-[#101418]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-[#b9c1c5] outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[#e8bd62]"
              href={`/content/${teleprompter.contentId}`}
            >
              <ArrowLeftIcon aria-hidden="true" />
              <span>{t("backToEditor")}</span>
            </Link>
            <span aria-hidden="true" className="h-6 w-px bg-white/15" />
            <div className="min-w-0">
              <p className="text-[0.7rem] font-medium tracking-[0.18em] text-[#d9a441] uppercase">
                {t("eyebrow")}
              </p>
              <h1
                className="truncate text-lg font-semibold tracking-tight sm:text-xl"
                dir="auto"
                lang={teleprompter.contentLanguage}
              >
                {teleprompter.contentTitle}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#b9c1c5]">
            <MonitorPlayIcon aria-hidden="true" />
            <span>{t("version", { version: teleprompter.acceptedVersionNumber })}</span>
          </div>
        </div>
      </header>

      <section className="relative min-h-0 flex-1 px-3 py-3 sm:px-6 sm:py-5">
        <div className="relative mx-auto h-full max-w-[90rem] overflow-hidden rounded-2xl border border-white/10 bg-[#171d21] shadow-2xl shadow-black/20">
          <div
            aria-label={t("scriptLabel")}
            className="h-full overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#e8bd62]"
            data-testid="teleprompter-reading-surface"
            onScroll={() => {
              updateProgress();
              const surface = readingSurfaceRef.current;
              if (!surface) return;
              if (
                playbackStateRef.current !== "paused" &&
                Math.abs(surface.scrollTop - lastAutoScrollTopRef.current) > 1
              ) {
                pausePlayback();
              }
            }}
            ref={readingSurfaceRef}
            role="region"
            tabIndex={0}
          >
            <div
              className={`mx-auto w-full px-5 py-[28vh] sm:px-10 ${reducedMotion ? "" : "transition-[max-width] duration-200"}`}
              data-mirror={mirror ? "true" : "false"}
              style={{ maxWidth: `${lineWidth}ch`, transform: mirror ? "scaleX(-1)" : undefined }}
            >
              <div
                className="mb-12 border-s-2 border-[#d9a441] ps-5 text-sm text-[#b9c1c5]"
                dir="auto"
              >
                <span className="font-medium tracking-[0.16em] text-[#d9a441] uppercase">
                  {t("scriptLabel")}
                </span>
              </div>
              <ol className="m-0 list-none space-y-16 p-0" aria-label={t("scriptLabel")}>
                {teleprompter.scriptBlocks.map((block, index) => {
                  const blockLabel = `${t("scriptLabel")} ${index + 1}`;
                  return (
                    <li key={block.id}>
                      <article aria-labelledby={`teleprompter-block-${block.id}`}>
                        <h2 className="sr-only" id={`teleprompter-block-${block.id}`}>
                          {blockLabel}
                        </h2>
                        <p
                          className="m-0 whitespace-pre-wrap break-words text-[length:var(--teleprompter-text-size)] leading-[1.65] font-medium tracking-[0.005em] text-[#fffaf2]"
                          dir="auto"
                          lang={teleprompter.contentLanguage}
                          style={{ "--teleprompter-text-size": `${textSize}rem` } as CSSProperties}
                        >
                          {block.text}
                        </p>
                        {hintsVisible && block.performanceHints.length ? (
                          <aside
                            aria-label={t("performanceHints")}
                            className="mt-8 border-s-4 border-[#d9a441]/80 bg-[#20292d] px-4 py-3 text-base text-[#e5c77f] shadow-inner shadow-black/10"
                            dir="auto"
                            role="note"
                          >
                            <h3 className="text-xs font-semibold tracking-[0.14em] text-[#f0d99c] uppercase">
                              {t("performanceHints")}
                            </h3>
                            <ul className="mt-2 grid gap-2">
                              {block.performanceHints.map((hint) => (
                                <li
                                  className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
                                  key={hint.id}
                                >
                                  <span
                                    className="font-semibold"
                                    lang={locale}
                                    dir={locale === "fa" ? "rtl" : "ltr"}
                                  >
                                    {contentT(`directionType${hint.type}`)}
                                  </span>
                                  {hintDetail(hint) ? (
                                    <bdi className="break-words" dir="auto" lang={locale}>
                                      {hintDetail(hint)}
                                    </bdi>
                                  ) : null}
                                  {hint.nuance ? (
                                    <span className="basis-full text-sm text-[#f0d99c]">
                                      <span className="font-medium">{t("noteLabel")}:</span>{" "}
                                      <bdi dir="auto" lang={teleprompter.contentLanguage}>
                                        {hint.nuance}
                                      </bdi>
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </aside>
                        ) : null}
                      </article>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <footer className="shrink-0 border-t border-white/10 bg-[#101418] px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto grid max-w-[90rem] gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div
              className="flex min-w-52 flex-1 items-center gap-3"
              aria-label={t("progressLabel")}
            >
              <progress
                aria-label={t("progressLabel")}
                aria-valuetext={t("progressValue", { percent: progress })}
                className="h-2 min-w-0 flex-1 accent-[#d9a441]"
                max={100}
                value={progress}
              />
              <span className="shrink-0 text-xs tabular-nums text-[#b9c1c5]">
                {t("progressValue", { percent: progress })}
              </span>
            </div>
            <div
              aria-live="polite"
              className="min-h-6 text-sm font-medium text-[#f0d99c]"
              role="status"
            >
              {countdown !== null
                ? t("countdown", { count: countdown })
                : statusMessage || t("statusPaused")}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-label={playbackLabel}
              className="min-h-11 bg-[#d9a441] text-[#17120a] hover:bg-[#e8bd62] focus-visible:ring-[#f0d99c]"
              data-testid="teleprompter-play"
              onClick={togglePlayback}
              type="button"
            >
              {playbackIcon}
              {playbackLabel}
            </Button>
            <Button
              aria-label={t("restart")}
              className="min-h-11 border-white/15 bg-transparent text-[#f5f0e8] hover:bg-white/10 hover:text-white"
              data-testid="teleprompter-restart"
              onClick={restart}
              type="button"
              variant="outline"
            >
              <RotateCcwIcon aria-hidden="true" />
              <span className="hidden sm:inline">{t("restart")}</span>
            </Button>
            <Button
              aria-pressed={hintsVisible}
              aria-label={hintsVisible ? t("hideHints") : t("showHints")}
              className="min-h-11 border-white/15 bg-transparent text-[#f5f0e8] hover:bg-white/10 hover:text-white"
              onClick={() => setHintsVisible((visible) => !visible)}
              type="button"
              variant="outline"
            >
              <Settings2Icon aria-hidden="true" />
              <span className="hidden md:inline">{t("performanceHints")}</span>
            </Button>
            <Button
              aria-pressed={mirror}
              aria-label={t("mirror")}
              className="min-h-11 border-white/15 bg-transparent text-[#f5f0e8] hover:bg-white/10 hover:text-white"
              onClick={() => setMirror((enabled) => !enabled)}
              type="button"
              variant="outline"
            >
              {mirror ? <ShrinkIcon aria-hidden="true" /> : <ExpandIcon aria-hidden="true" />}
              <span className="hidden md:inline">{t("mirror")}</span>
            </Button>
            <Button
              aria-label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
              className="min-h-11 border-white/15 bg-transparent text-[#f5f0e8] hover:bg-white/10 hover:text-white"
              onClick={() => void toggleFullscreen()}
              type="button"
              variant="outline"
            >
              {isFullscreen ? (
                <Minimize2Icon aria-hidden="true" />
              ) : (
                <Maximize2Icon aria-hidden="true" />
              )}
              <span className="hidden md:inline">
                {isFullscreen ? t("exitFullscreen") : t("fullscreen")}
              </span>
            </Button>

            <div className="ms-auto flex flex-wrap items-center gap-3 text-xs text-[#b9c1c5]">
              <label className="grid min-w-24 gap-1">
                <span>
                  {t("speedLabel")}: {t("speedValue", { value: formatNumber(speed) })}
                </span>
                <input
                  aria-label={t("speedLabel")}
                  className="h-2 w-28 accent-[#d9a441] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d99c]"
                  max={MAX_SPEED}
                  min={MIN_SPEED}
                  onChange={(event) => setSpeed(Number(event.target.value))}
                  step={SPEED_STEP}
                  type="range"
                  value={speed}
                />
              </label>
              <label className="grid min-w-24 gap-1">
                <span>
                  {t("textSizeLabel")}: {t("textSizeValue", { value: formatNumber(textSize) })}
                </span>
                <input
                  aria-label={t("textSizeLabel")}
                  className="h-2 w-28 accent-[#d9a441] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d99c]"
                  max={MAX_TEXT_SIZE}
                  min={MIN_TEXT_SIZE}
                  onChange={(event) => setTextSize(Number(event.target.value))}
                  step={TEXT_SIZE_STEP}
                  type="range"
                  value={textSize}
                />
              </label>
              <label className="grid min-w-24 gap-1">
                <span>
                  {t("lineWidthLabel")}: {t("lineWidthValue", { value: lineWidth })}
                </span>
                <input
                  aria-label={t("lineWidthLabel")}
                  className="h-2 w-28 accent-[#d9a441] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d99c]"
                  max={MAX_LINE_WIDTH}
                  min={MIN_LINE_WIDTH}
                  onChange={(event) => setLineWidth(Number(event.target.value))}
                  step={LINE_WIDTH_STEP}
                  type="range"
                  value={lineWidth}
                />
              </label>
            </div>
          </div>

          <details className="text-xs text-[#9fa9ae]">
            <summary className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded px-1 py-1 font-medium text-[#c8d0d4] outline-none focus-visible:ring-2 focus-visible:ring-[#f0d99c]">
              <GaugeIcon aria-hidden="true" />
              {t("keyboardHelp").split(":")[0]}
            </summary>
            <p className="mt-1 max-w-5xl leading-5">{t("keyboardHelp")}</p>
          </details>
        </div>
      </footer>
    </main>
  );
}
