"use client";
/* eslint-disable @next/next/no-img-element -- signed provider URLs cannot use the optimizer. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { activeMediaRefreshLeadMs } from "../application/asset-capability-service";

export type RequestAssetCapability = (
  operation: "PREVIEW" | "DOWNLOAD",
) => Promise<Readonly<{ url: string; expiresAt: Date | string }>>;

type CapabilityState = Readonly<{ url: string; expiresAt: Date }>;

function usePreviewCapability(
  request: RequestAssetCapability,
  active: boolean,
  refreshable: boolean,
) {
  const [capability, setCapability] = useState<CapabilityState>();
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const load = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      const next = await request("PREVIEW");
      setCapability({ url: next.url, expiresAt: new Date(next.expiresAt) });
      setError(false);
    } catch {
      setError(true);
    }
  }, [request]);
  useEffect(() => {
    const start = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(start);
      clearTimeout(timer.current);
    };
  }, [load]);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!refreshable || !active || !capability || error) return;
    timer.current = setTimeout(
      () => void load(),
      Math.max(0, capability.expiresAt.getTime() - Date.now() - activeMediaRefreshLeadMs),
    );
    return () => clearTimeout(timer.current);
  }, [active, capability, error, load, refreshable]);
  return { capability, error, retry: load };
}

export function PrivateAssetImagePreview({
  requestCapability,
  alt,
}: Readonly<{ requestCapability: RequestAssetCapability; alt: string }>) {
  const t = useTranslations("Assets");
  const { capability, error, retry } = usePreviewCapability(requestCapability, false, false);
  if (error) return <Retry retry={retry} />;
  if (!capability) return <p role="status">{t("loading")}</p>;
  return <img src={capability.url} alt={alt} dir="ltr" onError={() => void retry()} />;
}

export function PrivateAssetVideoPreview({
  requestCapability,
  label,
  active = true,
}: Readonly<{ requestCapability: RequestAssetCapability; label: string; active?: boolean }>) {
  return (
    <PrivateNativeMediaPreview
      kind="video"
      requestCapability={requestCapability}
      label={label}
      active={active}
    />
  );
}

export function PrivateAssetAudioPreview({
  requestCapability,
  label,
  active = true,
}: Readonly<{ requestCapability: RequestAssetCapability; label: string; active?: boolean }>) {
  return (
    <PrivateNativeMediaPreview
      kind="audio"
      requestCapability={requestCapability}
      label={label}
      active={active}
    />
  );
}

function PrivateNativeMediaPreview({
  kind,
  requestCapability,
  label,
  active,
}: Readonly<{
  kind: "video" | "audio";
  requestCapability: RequestAssetCapability;
  label: string;
  active: boolean;
}>) {
  const { capability, error, retry } = usePreviewCapability(requestCapability, active, true);
  const media = useRef<HTMLMediaElement>(null);
  const snapshot = useRef<
    | Readonly<{ time: number; paused: boolean; volume: number; muted: boolean; rate: number }>
    | undefined
  >(undefined);
  useEffect(() => {
    const element = media.current;
    if (!element || !capability) return;
    snapshot.current = {
      time: element.currentTime,
      paused: element.paused,
      volume: element.volume,
      muted: element.muted,
      rate: element.playbackRate,
    };
  }, [capability]);
  const restore = () => {
    const element = media.current,
      state = snapshot.current;
    if (!element || !state) return;
    element.currentTime = state.time;
    element.volume = state.volume;
    element.muted = state.muted;
    element.playbackRate = state.rate;
    if (!state.paused) void element.play().catch(() => undefined);
  };
  if (error) return <Retry retry={retry} />;
  if (!capability) return <p role="status">Loading media…</p>;
  return kind === "video" ? (
    <video
      ref={media as React.RefObject<HTMLVideoElement>}
      controls
      src={capability.url}
      aria-label={label}
      onLoadedMetadata={restore}
      dir="ltr"
    />
  ) : (
    <audio
      ref={media as React.RefObject<HTMLAudioElement>}
      controls
      src={capability.url}
      aria-label={label}
      onLoadedMetadata={restore}
      dir="ltr"
    />
  );
}

function Retry({ retry }: Readonly<{ retry: () => Promise<void> }>) {
  const t = useTranslations("Assets");
  return (
    <div role="alert">
      <p>{t("accessError")}</p>
      <Button type="button" onClick={() => void retry()}>
        {t("retry")}
      </Button>
    </div>
  );
}

export function PrivateAssetDownloadButton({
  requestCapability,
}: Readonly<{ requestCapability: RequestAssetCapability }>) {
  const t = useTranslations("Assets");
  return (
    <Button
      type="button"
      onClick={() =>
        void requestCapability("DOWNLOAD")
          .then((capability) => window.location.assign(capability.url))
          .catch(() => undefined)
      }
    >
      {t("download")}
    </Button>
  );
}
