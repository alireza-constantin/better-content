"use client";
/* eslint-disable @next/next/no-img-element -- signed provider URLs cannot use the optimizer. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { issueAssetCapabilityAction } from "../application/asset-capability-actions";
import { activeMediaRefreshLeadMs } from "../domain/asset-capability-contracts";

export type RequestAssetCapability = (
  operation: "PREVIEW" | "DOWNLOAD",
) => Promise<Readonly<{ url: string; expiresAt: Date | string }>>;

type CapabilityState = Readonly<{ url: string; expiresAt: Date }>;
type AssetCapabilityIdentity = Readonly<{ workspaceId: string; assetId: string }>;

function useCapabilityRequester(
  asset: AssetCapabilityIdentity | undefined,
  requestCapability: RequestAssetCapability | undefined,
): RequestAssetCapability {
  return useCallback(
    async (operation) => {
      if (requestCapability) return requestCapability(operation);
      if (!asset) throw new Error("An Asset identity is required.");
      return issueAssetCapabilityAction({ ...asset, operation });
    },
    [asset, requestCapability],
  );
}

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
  const fail = useCallback(() => {
    clearTimeout(timer.current);
    setError(true);
  }, []);
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
  return { capability, error, retry: load, fail };
}

export function PrivateAssetImagePreview({
  requestCapability,
  asset,
  alt,
  width,
  height,
}: Readonly<{
  requestCapability?: RequestAssetCapability;
  asset?: AssetCapabilityIdentity;
  alt: string;
  /** Validated READY image dimensions reserve space and prevent layout shift. */
  width: number;
  height: number;
}>) {
  const t = useTranslations("Assets");
  const request = useCapabilityRequester(asset, requestCapability);
  const { capability, error, retry, fail } = usePreviewCapability(request, false, false);
  if (error) return <Retry retry={retry} />;
  if (!capability) return <p role="status">{t("loading")}</p>;
  return (
    <img
      src={capability.url}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      dir="ltr"
      onError={fail}
    />
  );
}

export function PrivateAssetVideoPreview({
  requestCapability,
  asset,
  label,
  active = true,
}: Readonly<{
  requestCapability?: RequestAssetCapability;
  asset?: AssetCapabilityIdentity;
  label: string;
  active?: boolean;
}>) {
  return (
    <PrivateNativeMediaPreview
      kind="video"
      requestCapability={requestCapability}
      asset={asset}
      label={label}
      active={active}
    />
  );
}

export function PrivateAssetAudioPreview({
  requestCapability,
  asset,
  label,
  active = true,
}: Readonly<{
  requestCapability?: RequestAssetCapability;
  asset?: AssetCapabilityIdentity;
  label: string;
  active?: boolean;
}>) {
  return (
    <PrivateNativeMediaPreview
      kind="audio"
      requestCapability={requestCapability}
      asset={asset}
      label={label}
      active={active}
    />
  );
}

function PrivateNativeMediaPreview({
  kind,
  requestCapability,
  asset,
  label,
  active,
}: Readonly<{
  kind: "video" | "audio";
  requestCapability?: RequestAssetCapability;
  asset?: AssetCapabilityIdentity;
  label: string;
  active: boolean;
}>) {
  const t = useTranslations("Assets");
  const request = useCapabilityRequester(asset, requestCapability);
  const { capability, error, retry, fail } = usePreviewCapability(request, active, true);
  const media = useRef<HTMLMediaElement>(null);
  const snapshot = useRef<
    | Readonly<{ time: number; paused: boolean; volume: number; muted: boolean; rate: number }>
    | undefined
  >(undefined);
  const capturePlaybackState = useCallback(() => {
    const element = media.current;
    if (!element) return;
    snapshot.current = {
      time: element.currentTime,
      paused: element.paused,
      volume: element.volume,
      muted: element.muted,
      rate: element.playbackRate,
    };
  }, []);
  const restore = useCallback(() => {
    const element = media.current,
      state = snapshot.current;
    if (!element || !state) return;
    element.currentTime = state.time;
    element.volume = state.volume;
    element.muted = state.muted;
    element.playbackRate = state.rate;
    if (!state.paused) void element.play().catch(() => undefined);
  }, []);
  if (error) return <Retry retry={retry} />;
  if (!capability) return <p role="status">{t("loading")}</p>;
  return kind === "video" ? (
    <video
      ref={media as React.RefObject<HTMLVideoElement>}
      controls
      src={capability.url}
      aria-label={label}
      onLoadedMetadata={restore}
      onPlay={capturePlaybackState}
      onPause={capturePlaybackState}
      onTimeUpdate={capturePlaybackState}
      onVolumeChange={capturePlaybackState}
      onRateChange={capturePlaybackState}
      onError={fail}
      dir="ltr"
    />
  ) : (
    <audio
      ref={media as React.RefObject<HTMLAudioElement>}
      controls
      src={capability.url}
      aria-label={label}
      onLoadedMetadata={restore}
      onPlay={capturePlaybackState}
      onPause={capturePlaybackState}
      onTimeUpdate={capturePlaybackState}
      onVolumeChange={capturePlaybackState}
      onRateChange={capturePlaybackState}
      onError={fail}
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
  asset,
  onNavigate = (url) => window.location.assign(url),
}: Readonly<{
  requestCapability?: RequestAssetCapability;
  asset?: AssetCapabilityIdentity;
  /** Testable navigation seam; callers normally use the browser location assignment. */
  onNavigate?: (url: string) => void;
}>) {
  const t = useTranslations("Assets");
  const request = useCapabilityRequester(asset, requestCapability);
  const [error, setError] = useState(false);
  const download = useCallback(async () => {
    try {
      const capability = await request("DOWNLOAD");
      onNavigate(capability.url);
      setError(false);
    } catch {
      setError(true);
    }
  }, [onNavigate, request]);
  return (
    <div>
      <Button type="button" onClick={() => void download()}>
        {t("download")}
      </Button>
      {error ? <p role="alert">{t("accessError")}</p> : null}
    </div>
  );
}
