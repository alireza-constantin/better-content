"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileAudioIcon, FileImageIcon, FileVideoIcon, LinkIcon, UploadIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useForm,
  type FieldError as HookFormFieldError,
  type UseFormRegisterReturn,
} from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import type { AssetLibraryDto, AssetLibraryItemDto } from "../application/asset-library-service";
import {
  beginAssetUploadAction,
  createExternalAssetLinkAction,
  finalizeAssetUploadAction,
  getAssetLibraryAction,
  renameAssetAction,
} from "../application/asset-library-actions";
import {
  PrivateAssetAudioPreview,
  PrivateAssetDownloadButton,
  PrivateAssetImagePreview,
  PrivateAssetVideoPreview,
} from "./private-asset-preview";
import { assetLibraryHref, type AssetLibraryUrlState } from "./asset-library-url-state";

const mediaTypes = ["IMAGE", "VIDEO", "AUDIO"] as const;
const statuses = ["PENDING", "PROCESSING", "READY", "FAILED", "DELETING"] as const;
type MediaType = (typeof mediaTypes)[number];
type Status = (typeof statuses)[number];

const assetCreationSchema = z.object({
  mediaType: z.enum(mediaTypes),
  displayName: z.string().min(1).max(200),
});
const uploadCreationSchema = assetCreationSchema.extend({ file: z.custom<FileList>() });
const linkCreationSchema = assetCreationSchema.extend({ sourceUrl: z.string().url().max(4_096) });
const renameSchema = z.object({ displayName: z.string().min(1).max(200) });

type AssetLibraryWorkspaceProps = Readonly<{
  workspaceId: string;
  initialLibrary: AssetLibraryDto;
  initialUrlState: AssetLibraryUrlState;
}>;

function statusLabel(t: ReturnType<typeof useTranslations>, status: Status) {
  return t(`status${status}`);
}

function statusVariant(status: Status): "default" | "secondary" | "destructive" | "outline" {
  if (status === "READY") return "default";
  if (status === "FAILED") return "destructive";
  if (status === "DELETING") return "outline";
  return "secondary";
}

function formatBytes(bytes: number | null, locale: string): string | null {
  if (bytes === null) return null;
  if (bytes < 1024) return `${new Intl.NumberFormat(locale).format(bytes)} B`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024)} KiB`;
}

function formatDuration(durationMs: number | null, locale: string): string | null {
  if (durationMs === null) return null;
  const seconds = Math.round(durationMs / 1_000);
  return `${new Intl.NumberFormat(locale).format(Math.floor(seconds / 60))}:${new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(seconds % 60)}`;
}

function AssetStatusBadge({ status }: Readonly<{ status: Status }>) {
  const t = useTranslations("AssetLibrary");
  return <Badge variant={statusVariant(status)}>{statusLabel(t, status)}</Badge>;
}

function VisibleAssetImage({
  asset,
  workspaceId,
}: Readonly<{ asset: AssetLibraryItemDto; workspaceId: string }>) {
  const [visible, setVisible] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry?.isIntersecting ?? false),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={host} className="aspect-video overflow-hidden rounded-lg bg-muted">
      {visible && asset.width && asset.height ? (
        <PrivateAssetImagePreview
          asset={{ workspaceId, assetId: asset.id }}
          alt=""
          width={asset.width}
          height={asset.height}
        />
      ) : (
        <FileImageIcon aria-hidden="true" className="m-auto size-7 text-muted-foreground" />
      )}
    </div>
  );
}

function AssetPlaceholder({ mediaType }: Readonly<{ mediaType: MediaType }>) {
  const Icon =
    mediaType === "VIDEO" ? FileVideoIcon : mediaType === "AUDIO" ? FileAudioIcon : FileImageIcon;
  return (
    <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
      <Icon aria-hidden="true" className="size-7 text-muted-foreground" />
    </div>
  );
}

function useLifecyclePolling(
  workspaceId: string,
  urlState: AssetLibraryUrlState,
  active: boolean,
  library: AssetLibraryDto,
  setLibrary: (library: AssetLibraryDto) => void,
) {
  const lifecycleStartedAt = useRef<number | null>(null);
  const activeLifecycleCount = library.assets.filter(
    (asset) => asset.status === "PENDING" || asset.status === "PROCESSING",
  ).length;
  useEffect(() => {
    if (!active || activeLifecycleCount === 0) {
      lifecycleStartedAt.current = null;
      return;
    }
    let cancelled = false;
    lifecycleStartedAt.current ??= Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const result = await getAssetLibraryAction({ workspaceId, ...urlState });
      if (!cancelled && result.ok) setLibrary(result.value);
      if (cancelled) return;
      timer = setTimeout(
        refresh,
        Date.now() - (lifecycleStartedAt.current ?? Date.now()) >= 60_000 ? 15_000 : 5_000,
      );
    };
    timer = setTimeout(refresh, 5_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, activeLifecycleCount, setLibrary, urlState, workspaceId]);
}

function AssetFilters({ state }: Readonly<{ state: AssetLibraryUrlState }>) {
  const t = useTranslations("AssetLibrary");
  const router = useRouter();
  const [search, setSearch] = useState(state.search);
  const update = (patch: Partial<AssetLibraryUrlState>) =>
    router.push(assetLibraryHref({ ...state, page: 1, ...patch }));
  return (
    <form
      className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        update({ search });
      }}
    >
      <div>
        <Label className="sr-only" htmlFor="asset-library-search">
          {t("searchLabel")}
        </Label>
        <Input
          id="asset-library-search"
          autoComplete="off"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
        />
      </div>
      <select
        aria-label={t("mediaTypeLabel")}
        className="h-9 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        value={state.mediaType ?? "ALL"}
        onChange={(event) =>
          update({
            mediaType: event.target.value === "ALL" ? null : (event.target.value as MediaType),
          })
        }
      >
        <option value="ALL">{t("allMediaTypes")}</option>
        {mediaTypes.map((type) => (
          <option key={type} value={type}>
            {t(`type${type}`)}
          </option>
        ))}
      </select>
      <select
        aria-label={t("lifecycleLabel")}
        className="h-9 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        value={state.status ?? "ALL"}
        onChange={(event) =>
          update({ status: event.target.value === "ALL" ? null : (event.target.value as Status) })
        }
      >
        <option value="ALL">{t("allLifecycles")}</option>
        {statuses.map((status) => (
          <option key={status} value={status}>
            {statusLabel(t, status)}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button type="submit">{t("search")}</Button>
        <Button type="button" variant="outline" onClick={() => router.push("/assets")}>
          {t("clear")}
        </Button>
      </div>
    </form>
  );
}

function CreationPanel({
  workspaceId,
  onCreated,
}: Readonly<{ workspaceId: string; onCreated: () => void }>) {
  const t = useTranslations("AssetLibrary");
  const [notice, setNotice] = useState<"error" | "uploading" | "created" | null>(null);
  const upload = useForm<{ mediaType: MediaType; displayName: string; file: FileList }>({
    resolver: zodResolver(uploadCreationSchema),
    defaultValues: { mediaType: "IMAGE", displayName: "" },
  });
  const link = useForm<{ mediaType: MediaType; displayName: string; sourceUrl: string }>({
    resolver: zodResolver(linkCreationSchema),
    defaultValues: { mediaType: "IMAGE", displayName: "", sourceUrl: "" },
  });
  const createUpload = upload.handleSubmit(async (values) => {
    const file = values.file?.item?.(0) ?? values.file?.[0];
    if (!file) {
      upload.setError("file", { message: t("fileRequired") });
      return;
    }
    try {
      setNotice("uploading");
      const begin = await beginAssetUploadAction({
        workspaceId,
        mediaType: values.mediaType,
        displayName: values.displayName,
        originalFilename: file.name,
        expectedUploadSizeBytes: file.size,
        browserMimeType: file.type || undefined,
      });
      if (!begin.ok) {
        setNotice("error");
        return;
      }
      const uploadResponse = await fetch(begin.value.capability.url, {
        method: "PUT",
        body: file,
        headers: file.type ? { "Content-Type": file.type } : undefined,
      });
      if (!uploadResponse.ok) {
        setNotice("error");
        return;
      }
      const finalized = await finalizeAssetUploadAction({
        workspaceId,
        assetId: begin.value.assetId,
      });
      if (!finalized.ok) {
        setNotice("error");
        return;
      }
      upload.reset();
      setNotice("created");
      onCreated();
    } catch {
      setNotice("error");
    }
  });
  const createLink = link.handleSubmit(async (values) => {
    try {
      const result = await createExternalAssetLinkAction({ workspaceId, ...values });
      if (!result.ok) {
        setNotice("error");
        return;
      }
      link.reset();
      setNotice("created");
      onCreated();
    } catch {
      setNotice("error");
    }
  });
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-lg">{t("addMedia")}</CardTitle>
        <CardDescription>{t("addMediaDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <form className="grid gap-3" onSubmit={createUpload}>
          <p className="text-sm font-medium">{t("uploadTitle")}</p>
          <CreationFields
            displayNameRegistration={upload.register("displayName")}
            errors={upload.formState.errors}
            fileRegistration={upload.register("file")}
            mediaTypeRegistration={upload.register("mediaType")}
            prefix="upload"
            t={t}
          />
          <Button className="min-h-11" disabled={upload.formState.isSubmitting} type="submit">
            <UploadIcon data-icon="inline-start" />
            {t("upload")}
          </Button>
        </form>
        <form
          className="grid gap-3 border-t pt-6 lg:border-t-0 lg:border-s lg:ps-6 lg:pt-0"
          onSubmit={createLink}
        >
          <p className="text-sm font-medium">{t("linkTitle")}</p>
          <CreationFields
            displayNameRegistration={link.register("displayName")}
            errors={link.formState.errors}
            mediaTypeRegistration={link.register("mediaType")}
            prefix="link"
            sourceUrlRegistration={link.register("sourceUrl")}
            t={t}
          />
          <Button
            className="min-h-11"
            disabled={link.formState.isSubmitting}
            type="submit"
            variant="outline"
          >
            <LinkIcon data-icon="inline-start" />
            {t("addLink")}
          </Button>
        </form>
      </CardContent>
      {notice ? (
        <p
          className={
            notice === "error"
              ? "px-6 text-sm text-destructive"
              : "px-6 text-sm text-muted-foreground"
          }
          role={notice === "error" ? "alert" : "status"}
        >
          {notice === "error"
            ? t("creationError")
            : notice === "uploading"
              ? t("uploading")
              : t("creationSuccess")}
        </p>
      ) : null}
    </Card>
  );
}

function CreationFields({
  displayNameRegistration,
  errors,
  fileRegistration,
  mediaTypeRegistration,
  prefix,
  sourceUrlRegistration,
  t,
}: Readonly<{
  displayNameRegistration: UseFormRegisterReturn;
  errors: Readonly<{
    displayName?: HookFormFieldError;
    file?: HookFormFieldError;
    sourceUrl?: HookFormFieldError;
  }>;
  fileRegistration?: UseFormRegisterReturn;
  mediaTypeRegistration: UseFormRegisterReturn;
  prefix: string;
  sourceUrlRegistration?: UseFormRegisterReturn;
  t: ReturnType<typeof useTranslations>;
}>) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${prefix}-name`}>{t("displayName")}</FieldLabel>
        <Input autoComplete="off" id={`${prefix}-name`} {...displayNameRegistration} />
        <FieldError errors={[errors.displayName]} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${prefix}-type`}>{t("mediaTypeLabel")}</FieldLabel>
        <select
          id={`${prefix}-type`}
          className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"
          {...mediaTypeRegistration}
        >
          {mediaTypes.map((type) => (
            <option key={type} value={type}>
              {t(`type${type}`)}
            </option>
          ))}
        </select>
      </Field>
      {fileRegistration ? (
        <Field>
          <FieldLabel htmlFor={`${prefix}-file`}>{t("file")}</FieldLabel>
          <Input
            id={`${prefix}-file`}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,audio/mpeg,audio/mp4,audio/wav"
            {...fileRegistration}
          />
          <FieldError errors={[errors.file]} />
        </Field>
      ) : (
        <Field>
          <FieldLabel htmlFor={`${prefix}-url`}>{t("mediaLink")}</FieldLabel>
          <Input
            id={`${prefix}-url`}
            type="url"
            autoComplete="off"
            placeholder="https://…"
            {...sourceUrlRegistration}
          />
          <FieldError errors={[errors.sourceUrl]} />
        </Field>
      )}
    </>
  );
}

function AssetDetail({
  asset,
  workspaceId,
  onClose,
  onRenamed,
}: Readonly<{
  asset: AssetLibraryItemDto | null;
  workspaceId: string;
  onClose: () => void;
  onRenamed: () => void;
}>) {
  const t = useTranslations("AssetLibrary");
  const locale = useLocale();
  const rename = useForm<{ displayName: string }>({
    resolver: zodResolver(renameSchema),
    values: { displayName: asset?.displayName ?? "" },
  });
  if (!asset) return null;
  const ready = asset.status === "READY";
  const submitRename = rename.handleSubmit(async (values) => {
    const result = await renameAssetAction({
      workspaceId,
      assetId: asset.id,
      displayName: values.displayName,
    });
    if (!result.ok) {
      rename.setError("displayName", { message: t("renameError") });
      return;
    }
    onRenamed();
  });
  return (
    <Dialog open={Boolean(asset)} onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogContent className="max-w-2xl" dir={locale === "fa" ? "rtl" : "ltr"}>
            <DialogHeader>
              <DialogTitle className="break-words">
                <bdi dir="auto">{asset.displayName}</bdi>
              </DialogTitle>
              <DialogDescription>{statusLabel(t, asset.status)}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 py-2">
              {ready && asset.mediaType === "IMAGE" && asset.width && asset.height ? (
                <PrivateAssetImagePreview
                  asset={{ workspaceId, assetId: asset.id }}
                  alt={asset.displayName}
                  width={asset.width}
                  height={asset.height}
                />
              ) : null}
              {ready && asset.mediaType === "VIDEO" ? (
                <PrivateAssetVideoPreview
                  asset={{ workspaceId, assetId: asset.id }}
                  label={asset.displayName}
                />
              ) : null}
              {ready && asset.mediaType === "AUDIO" ? (
                <PrivateAssetAudioPreview
                  asset={{ workspaceId, assetId: asset.id }}
                  label={asset.displayName}
                />
              ) : null}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <dt>{t("mediaTypeLabel")}</dt>
                <dd>{t(`type${asset.mediaType}`)}</dd>
                <dt>{t("source")}</dt>
                <dd>{asset.sourceType === "UPLOAD" ? t("uploadSource") : asset.sourceHost}</dd>
                <dt>{t("technicalMetadata")}</dt>
                <dd>
                  {formatBytes(asset.byteSize, locale) ?? t("metadataPending")}
                  {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
                  {formatDuration(asset.durationMs, locale)
                    ? ` · ${formatDuration(asset.durationMs, locale)}`
                    : ""}
                </dd>
                <dt>{t("references", { count: asset.referenceCount })}</dt>
                <dd>{asset.referenceCount}</dd>
              </dl>
              {asset.status === "FAILED" ? (
                <p role="alert" className="text-sm text-destructive">
                  {t("failedDescription")}
                </p>
              ) : null}
              {!ready ? (
                <p className="text-sm text-muted-foreground">
                  {asset.status === "DELETING"
                    ? t("deletingDescription")
                    : t("notReadyDescription")}
                </p>
              ) : null}
              {asset.status !== "DELETING" ? (
                <form className="grid gap-3 border-t pt-4" onSubmit={submitRename}>
                  <Field>
                    <FieldLabel htmlFor="asset-rename">{t("displayName")}</FieldLabel>
                    <Input id="asset-rename" {...rename.register("displayName")} />
                    <FieldError errors={[rename.formState.errors.displayName]} />
                  </Field>
                  <Button
                    className="w-fit"
                    disabled={rename.formState.isSubmitting}
                    type="submit"
                    variant="outline"
                  >
                    {t("rename")}
                  </Button>
                </form>
              ) : null}
            </div>
            <DialogFooter>
              {ready ? (
                <PrivateAssetDownloadButton asset={{ workspaceId, assetId: asset.id }} />
              ) : null}
              <DialogClose className="inline-flex min-h-9 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                {t("close")}
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}

function AssetLibraryWorkspaceSession({
  workspaceId,
  initialLibrary,
  initialUrlState,
}: AssetLibraryWorkspaceProps) {
  const t = useTranslations("AssetLibrary");
  const locale = useLocale();
  const router = useRouter();
  const [library, setLibrary] = useState(initialLibrary);
  const [selected, setSelected] = useState<AssetLibraryItemDto | null>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useLifecyclePolling(workspaceId, initialUrlState, visible, library, setLibrary);
  const refresh = useCallback(() => router.refresh(), [router]);
  return (
    <section
      className="mx-auto grid w-full max-w-[1360px] gap-6"
      dir={locale === "fa" ? "rtl" : "ltr"}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{t("eyebrow")}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("description")}
          </p>
        </div>
      </header>
      <CreationPanel workspaceId={workspaceId} onCreated={refresh} />
      <AssetFilters
        key={`${initialUrlState.page}:${initialUrlState.search}:${initialUrlState.mediaType ?? ""}:${initialUrlState.status ?? ""}`}
        state={initialUrlState}
      />
      {library.assets.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>{t("emptyTitle")}</CardTitle>
            <CardDescription>{t("emptyDescription")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {library.assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="group text-start focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={() => setSelected(asset)}
            >
              <Card className="h-full gap-4 p-4 transition-colors group-hover:border-primary/50">
                {asset.status === "READY" && asset.mediaType === "IMAGE" ? (
                  <VisibleAssetImage asset={asset} workspaceId={workspaceId} />
                ) : (
                  <AssetPlaceholder mediaType={asset.mediaType} />
                )}
                <div className="grid gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-medium">
                      <bdi dir="auto">{asset.displayName}</bdi>
                    </p>
                    <AssetStatusBadge status={asset.status} />
                  </div>
                  <div className="grid gap-1 text-sm text-muted-foreground">
                    <p>
                      {t(`type${asset.mediaType}`)} ·{" "}
                      {asset.sourceType === "UPLOAD" ? t("uploadSource") : asset.sourceHost}
                    </p>
                    <p>
                      {formatBytes(asset.byteSize, locale) ?? t("metadataPending")}
                      {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
                      {formatDuration(asset.durationMs, locale)
                        ? ` · ${formatDuration(asset.durationMs, locale)}`
                        : ""}
                    </p>
                    <p>{t("references", { count: asset.referenceCount })}</p>
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
      <nav className="flex items-center justify-between" aria-label={t("paginationLabel")}>
        <Button
          disabled={library.page <= 1}
          type="button"
          variant="outline"
          onClick={() =>
            router.push(assetLibraryHref({ ...initialUrlState, page: library.page - 1 }))
          }
        >
          {t("previous")}
        </Button>
        <span className="text-sm text-muted-foreground">{t("page", { page: library.page })}</span>
        <Button
          disabled={!library.hasNextPage}
          type="button"
          variant="outline"
          onClick={() =>
            router.push(assetLibraryHref({ ...initialUrlState, page: library.page + 1 }))
          }
        >
          {t("next")}
        </Button>
      </nav>
      <AssetDetail
        asset={selected}
        workspaceId={workspaceId}
        onClose={() => setSelected(null)}
        onRenamed={refresh}
      />
    </section>
  );
}

/** Recreates local polling state when the server component refreshes its authorized page DTO. */
export function AssetLibraryWorkspace(props: AssetLibraryWorkspaceProps) {
  const itemVersion = props.initialLibrary.assets
    .map((asset) => `${asset.id}:${asset.updatedAt.toISOString()}:${asset.status}`)
    .join("|");
  return (
    <AssetLibraryWorkspaceSession key={`${props.initialLibrary.page}:${itemVersion}`} {...props} />
  );
}
