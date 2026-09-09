"use client";

import { CheckIcon, ClipboardCheckIcon, ClipboardIcon, ClapperboardIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import {
  PrivateAssetAudioPreview,
  PrivateAssetImagePreview,
  PrivateAssetVideoPreview,
} from "@/modules/assets/presentation/private-asset-preview";
import type { ContentEditGuideAssetPresentation, ContentEditGuideResult } from "../application";
import type { EditGuideEditDirection } from "../domain";

type ReadyEditGuide = Extract<ContentEditGuideResult, { status: "READY" }>;

type Props = Readonly<{
  editGuide: ReadyEditGuide;
  locale: AppLocale;
  workspaceId: string;
}>;

function contentDirection(language: ReadyEditGuide["contentLanguage"]): "ltr" | "rtl" {
  return language === "fa" ? "rtl" : "ltr";
}

function CreatorValue({
  children,
  language,
}: Readonly<{ children: React.ReactNode; language: ReadyEditGuide["contentLanguage"] }>) {
  return (
    <span
      dir={contentDirection(language)}
      lang={language}
      className="break-words whitespace-pre-wrap"
    >
      {children}
    </span>
  );
}

function Detail({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 min-w-0 break-words leading-6">{children}</dd>
    </div>
  );
}

function AssetPresentation({
  assetId,
  asset,
  directionType,
  label,
  workspaceId,
}: Readonly<{
  assetId: string;
  asset: ContentEditGuideAssetPresentation | undefined;
  directionType: "BROLL_CUE" | "SOUND_CUE";
  label: string;
  workspaceId: string;
}>) {
  const t = useTranslations("Content");
  const isCompatible =
    asset !== undefined &&
    (directionType === "BROLL_CUE"
      ? asset.mediaType === "IMAGE" || asset.mediaType === "VIDEO"
      : asset.mediaType === "AUDIO");

  if (!asset || !isCompatible) {
    return (
      <p
        className="mt-3 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
        role="status"
      >
        {t("assetUnavailable")}
      </p>
    );
  }

  const identity = { workspaceId, assetId };
  return (
    <div className="mt-3 rounded-lg border border-border/70 bg-background p-3">
      <p className="text-sm font-medium">
        <bdi dir="auto" className="break-words">
          {asset.displayName}
        </bdi>{" "}
        <span className="text-muted-foreground">· {t(`assetType${asset.mediaType}`)}</span>
      </p>
      {asset.previewable && asset.mediaType === "IMAGE" && asset.width && asset.height ? (
        <div className="mt-3 overflow-hidden rounded-md bg-muted [&_img]:h-auto [&_img]:w-full">
          <PrivateAssetImagePreview
            asset={identity}
            alt={label}
            height={asset.height}
            width={asset.width}
          />
        </div>
      ) : asset.previewable && asset.mediaType === "VIDEO" ? (
        <div className="mt-3 overflow-hidden rounded-md bg-muted [&_video]:h-auto [&_video]:w-full">
          <PrivateAssetVideoPreview asset={identity} label={label} />
        </div>
      ) : asset.previewable && asset.mediaType === "AUDIO" ? (
        <div className="mt-3 [&_audio]:w-full">
          <PrivateAssetAudioPreview asset={identity} label={label} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {t("assetPreviewUnavailable")}
        </p>
      )}
    </div>
  );
}

function CopySearchQuery({ searchQuery }: Readonly<{ searchQuery: string }>) {
  const t = useTranslations("Content");
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(searchQuery);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={() => void copy()}
        type="button"
      >
        {state === "copied" ? (
          <ClipboardCheckIcon aria-hidden="true" />
        ) : (
          <ClipboardIcon aria-hidden="true" />
        )}
        {t("copySearchQuery")}
      </button>
      {state === "copied" ? (
        <span aria-live="polite" className="inline-flex items-center gap-1 text-sm" role="status">
          <CheckIcon aria-hidden="true" />
          {t("searchQueryCopied")}
        </span>
      ) : state === "failed" ? (
        <span aria-live="assertive" className="text-sm text-destructive" role="alert">
          {t("searchQueryCopyFailed")}
        </span>
      ) : null}
    </div>
  );
}

function DirectionCard({
  direction,
  index,
  language,
  workspaceId,
  assetPresentations,
}: Readonly<{
  direction: EditGuideEditDirection;
  index: number;
  language: ReadyEditGuide["contentLanguage"];
  workspaceId: string;
  assetPresentations: ReadyEditGuide["assetPresentations"];
}>) {
  const t = useTranslations("Content");
  const guide = useTranslations("EditGuide");
  const assetId = "assetId" in direction ? direction.assetId : undefined;
  const nuance = "nuance" in direction ? direction.nuance : undefined;
  const headingId = `edit-direction-${direction.id}`;
  const assetLabel = `${t(`directionType${direction.type}`)} ${guide("assetPreview")}`;

  const value = (field: string, current: string) => (
    <Detail label={t(`directionField${field}`)}>{t(`directionValue${current}`)}</Detail>
  );

  let payload: React.ReactNode;
  switch (direction.type) {
    case "TEXT_OVERLAY":
      payload = (
        <>
          <Detail label={t("directionFieldText")}>
            <CreatorValue language={language}>{direction.text}</CreatorValue>
          </Detail>
          {value("Placement", direction.placement)}
        </>
      );
      break;
    case "ZOOM":
      payload = (
        <>
          {value("Mode", direction.mode)}
          {value("Intensity", direction.intensity)}
        </>
      );
      break;
    case "CUT":
      payload = value("Style", direction.style);
      break;
    case "BROLL_CUE":
      payload = (
        <>
          <Detail label={guide("descriptionLabel")}>
            <CreatorValue language={language}>{direction.description}</CreatorValue>
          </Detail>
          {"searchQuery" in direction && direction.searchQuery ? (
            <Detail label={t("searchQueryLabel")}>
              <bdi dir="auto" className="break-words whitespace-pre-wrap">
                {direction.searchQuery}
              </bdi>
              <CopySearchQuery searchQuery={direction.searchQuery} />
            </Detail>
          ) : null}
        </>
      );
      break;
    case "SOUND_CUE":
      payload = (
        <>
          {value("Kind", direction.kind)}
          <Detail label={guide("descriptionLabel")}>
            <CreatorValue language={language}>{direction.description}</CreatorValue>
          </Detail>
        </>
      );
      break;
    case "CAPTION_EMPHASIS":
      payload = value("Style", direction.style);
      break;
    case "EDIT_NOTE":
      payload = (
        <Detail label={t("directionFieldText")}>
          <CreatorValue language={language}>{direction.text}</CreatorValue>
        </Detail>
      );
      break;
  }

  return (
    <li>
      <article
        aria-labelledby={headingId}
        className="rounded-lg border border-border/70 bg-muted/20 p-4"
      >
        <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold" id={headingId}>
          <span className="rounded-sm border border-border bg-background px-2 py-1 text-xs font-semibold uppercase">
            {t(`directionType${direction.type}`)}
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {guide("directionNumber", { number: index + 1 })}
          </span>
        </h4>
        <dl className="mt-4 grid gap-3">{payload}</dl>
        {nuance ? (
          <p
            className="mt-3 border-s-2 border-border ps-3 text-sm text-muted-foreground"
            dir={contentDirection(language)}
            lang={language}
          >
            <span className="font-medium">{t("directionFieldNuance")}:</span>{" "}
            <CreatorValue language={language}>{nuance}</CreatorValue>
          </p>
        ) : null}
        {(direction.type === "BROLL_CUE" || direction.type === "SOUND_CUE") && assetId ? (
          <AssetPresentation
            asset={assetPresentations[assetId]}
            assetId={assetId}
            directionType={direction.type}
            label={assetLabel}
            workspaceId={workspaceId}
          />
        ) : null}
      </article>
    </li>
  );
}

export function EditGuide({ editGuide, locale, workspaceId }: Props) {
  const t = useTranslations("EditGuide");
  const contentT = useTranslations("Content");
  const uiLocale = useLocale();
  const contentDir = contentDirection(editGuide.contentLanguage);

  return (
    <main
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12"
      dir={locale === "fa" ? "rtl" : "ltr"}
      lang={locale}
    >
      <Link
        className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        href={`/content/${editGuide.contentId}`}
      >
        {t("backToEditor")}
      </Link>
      <header className="mt-8 border-b border-border pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            {t("eyebrow")}
          </p>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium">
            <ClapperboardIcon aria-hidden="true" className="size-3.5" />
            {t("version", { version: editGuide.acceptedVersionNumber })}
          </span>
        </div>
        <h1 className="mt-3 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">{t("description")}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("contentLanguage", {
            language:
              editGuide.contentLanguage === "fa" ? contentT("persian") : contentT("english"),
          })}
        </p>
      </header>

      <section aria-labelledby="edit-guide-script-title" className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight" id="edit-guide-script-title">
              {t("scriptAndDirections")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("readOnlyNote")}</p>
          </div>
          <span
            className="text-sm tabular-nums text-muted-foreground"
            dir={uiLocale === "fa" ? "rtl" : "ltr"}
          >
            {t("blockCount", { count: editGuide.scriptBlocks.length })}
          </span>
        </div>

        <ol className="mt-6 grid gap-5" aria-label={t("scriptBlocksLabel")}>
          {editGuide.scriptBlocks.map((block, index) => (
            <li
              className="grid min-w-0 gap-6 overflow-hidden rounded-xl border border-border bg-background p-4 shadow-sm sm:p-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]"
              key={block.id}
            >
              <section aria-labelledby={`edit-guide-script-${block.id}`} className="min-w-0">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="text-xs font-semibold tabular-nums text-muted-foreground"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3
                    className="text-sm font-semibold uppercase tracking-wide"
                    id={`edit-guide-script-${block.id}`}
                  >
                    {t("scriptBlock", { number: index + 1 })}
                  </h3>
                </div>
                <p
                  className="mt-5 whitespace-pre-wrap break-words text-xl leading-9 text-foreground sm:text-2xl sm:leading-10"
                  dir={contentDir}
                  lang={editGuide.contentLanguage}
                >
                  {block.text || contentT("emptyScriptBlock")}
                </p>
              </section>

              <section
                aria-labelledby={`edit-guide-directions-${block.id}`}
                className="min-w-0 border-t border-border pt-5 md:border-s md:border-t-0 md:ps-6 md:pt-0"
              >
                <h3
                  className="text-sm font-semibold uppercase tracking-wide"
                  id={`edit-guide-directions-${block.id}`}
                >
                  {t("editDirections")}
                </h3>
                {block.editDirections.length ? (
                  <ol
                    className="mt-4 grid gap-3"
                    aria-label={t("directionsForBlock", { number: index + 1 })}
                  >
                    {block.editDirections.map((direction, directionIndex) => (
                      <DirectionCard
                        assetPresentations={editGuide.assetPresentations}
                        direction={direction}
                        index={directionIndex}
                        key={direction.id}
                        language={editGuide.contentLanguage}
                        workspaceId={workspaceId}
                      />
                    ))}
                  </ol>
                ) : (
                  <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                    {t("noEditDirections")}
                  </p>
                )}
              </section>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
