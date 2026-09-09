"use client";

import { SearchIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogViewport,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getAssetLibraryAction } from "@/modules/assets/application/asset-library-actions";
import type {
  AssetLibraryDto,
  AssetLibraryItemDto,
} from "@/modules/assets/application/asset-library-service";
import {
  PrivateAssetAudioPreview,
  PrivateAssetImagePreview,
  PrivateAssetVideoPreview,
} from "@/modules/assets/presentation/private-asset-preview";
import { AssetCreationPanel } from "@/modules/assets/presentation/asset-library-workspace";

type EligibleDirection = "BROLL_CUE" | "SOUND_CUE";
type Props = Readonly<{
  workspaceId: string;
  directionType: EligibleDirection;
  currentAssetId?: string;
  open: boolean;
  onClose: () => void;
  onUse: (assetId: string) => void;
  onDetach: () => void;
}>;

const compatibleTypes = {
  BROLL_CUE: ["IMAGE", "VIDEO"],
  SOUND_CUE: ["AUDIO"],
} as const;

/** Focused editor presentation over the Library's authorized query/action boundary. */
export function DirectionAssetPicker({
  workspaceId,
  directionType,
  currentAssetId,
  open,
  onClose,
  onUse,
  onDetach,
}: Props) {
  const t = useTranslations("Content");
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [library, setLibrary] = useState<AssetLibraryDto | null>(null);
  const [selected, setSelected] = useState<AssetLibraryItemDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [createdAssetIds, setCreatedAssetIds] = useState<string[]>([]);
  const [lifecycleAssets, setLifecycleAssets] = useState<readonly AssetLibraryItemDto[]>([]);
  const trigger = useRef<HTMLElement | null>(null);
  const types = compatibleTypes[directionType];

  useEffect(() => {
    if (!open) return;
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open, directionType]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getAssetLibraryAction({ workspaceId, page, search, mediaTypes: types, status: "READY" }).then(
      (result) => {
        if (cancelled) return;
        setLibrary(result.ok ? result.value : null);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, page, search, types, workspaceId, refreshToken]);
  useEffect(() => {
    if (!open || createdAssetIds.length === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshLifecycle = async () => {
      const result = await getAssetLibraryAction({
        workspaceId,
        page: 1,
        search: "",
        mediaTypes: types,
        assetIds: createdAssetIds,
      });
      if (cancelled) return;
      const assets = result.ok ? result.value.assets : [];
      setLifecycleAssets(assets);
      const active = assets.filter(
        (asset) => asset.status === "PENDING" || asset.status === "PROCESSING",
      );
      if (active.length) timer = setTimeout(refreshLifecycle, 5_000);
    };
    void refreshLifecycle();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [createdAssetIds, open, types, workspaceId]);
  useEffect(() => {
    if (!open || !library?.assets.some((asset) => asset.status !== "READY")) return;
    const timer = setTimeout(() => setPage((current) => current), 5_000);
    return () => clearTimeout(timer);
  }, [library, open]);

  const close = () => {
    onClose();
    queueMicrotask(() => trigger.current?.focus());
  };
  const selectedReady = selected?.status === "READY" && types.includes(selected.mediaType as never);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport className="items-end p-0 sm:items-center sm:p-4">
          <DialogContent
            className="flex max-h-[92dvh] max-w-3xl flex-col gap-4 overflow-y-auto rounded-b-none sm:rounded-xl"
            dir={locale === "fa" ? "rtl" : "ltr"}
          >
            <DialogHeader>
              <DialogTitle>{t("assetPickerTitle")}</DialogTitle>
              <DialogDescription>
                {t(
                  directionType === "BROLL_CUE"
                    ? "assetPickerBrollDescription"
                    : "assetPickerSoundDescription",
                )}
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setSearch(new FormData(event.currentTarget).get("search")?.toString() ?? "");
              }}
            >
              <Input
                autoComplete="off"
                name="search"
                aria-label={t("assetPickerSearch")}
                placeholder={t("assetPickerSearch")}
                defaultValue={search}
              />
              <Button type="submit" variant="outline">
                <SearchIcon aria-hidden="true" />
                {t("search")}
              </Button>
            </form>
            <div className="grid gap-3" aria-busy={loading}>
              {library?.assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => setSelected(asset)}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border p-3 text-start focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[selected=true]:border-primary"
                  data-selected={selected?.id === asset.id ? "true" : undefined}
                >
                  <span className="min-w-0">
                    <bdi dir="auto" className="block truncate font-medium">
                      {asset.displayName}
                    </bdi>
                    <span className="text-sm text-muted-foreground">
                      {t(`assetType${asset.mediaType}`)}
                    </span>
                  </span>
                  {asset.id === currentAssetId ? <Badge>{t("assetPickerCurrent")}</Badge> : null}
                </button>
              ))}
              {!loading && library?.assets.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("assetPickerEmpty")}</p>
              ) : null}
            </div>
            <AssetCreationPanel
              allowedMediaTypes={types}
              onCreated={(assetId) => {
                if (assetId) setCreatedAssetIds((ids) => [...ids, assetId].slice(-5));
                setPage(1);
                setRefreshToken((value) => value + 1);
              }}
              workspaceId={workspaceId}
            />
            {lifecycleAssets.length ? (
              <section aria-live="polite" className="grid gap-2 rounded-lg border p-3">
                <h3 className="text-sm font-medium">{t("assetCreationLifecycle")}</h3>
                {lifecycleAssets.map((asset) => (
                  <p className="text-sm" key={asset.id}>
                    <bdi dir="auto">{asset.displayName}</bdi>
                    {" · "}
                    {t(`assetStatus${asset.status}`)}
                  </p>
                ))}
              </section>
            ) : null}
            {selectedReady ? (
              <div className="rounded-lg border p-3">
                {selected.mediaType === "IMAGE" && selected.width && selected.height ? (
                  <PrivateAssetImagePreview
                    asset={{ workspaceId, assetId: selected.id }}
                    alt={selected.displayName}
                    width={selected.width}
                    height={selected.height}
                  />
                ) : null}
                {selected.mediaType === "VIDEO" ? (
                  <PrivateAssetVideoPreview
                    asset={{ workspaceId, assetId: selected.id }}
                    label={selected.displayName}
                  />
                ) : null}
                {selected.mediaType === "AUDIO" ? (
                  <PrivateAssetAudioPreview
                    asset={{ workspaceId, assetId: selected.id }}
                    label={selected.displayName}
                  />
                ) : null}
              </div>
            ) : null}
            <div className="flex justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                {t("previous")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!library?.hasNextPage}
                onClick={() => setPage((value) => value + 1)}
              >
                {t("next")}
              </Button>
            </div>
            <DialogFooter className="justify-end">
              {currentAssetId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onDetach();
                    close();
                  }}
                >
                  {t("detachAsset")}
                </Button>
              ) : null}
              <DialogClose>{t("cancel")}</DialogClose>
              <Button
                type="button"
                disabled={!selectedReady}
                onClick={() => {
                  if (selected) {
                    onUse(selected.id);
                    close();
                  }
                }}
              >
                {t(currentAssetId ? "replaceAsset" : "useAsset")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}
