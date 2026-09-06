"use client";

import { HistoryIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

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
  DialogTrigger,
  DialogViewport,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { ContentVersionDto } from "../application/content-read-service";
import type { ContentDocumentV2, EditDirection, PerformanceDirection } from "../domain";

type Props = Readonly<{
  versions: readonly ContentVersionDto[];
  acceptedVersionId: string | null;
  contentLanguage: "en" | "fa";
}>;

function formatVersionDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function sourceLabel(source: ContentVersionDto["source"], t: ReturnType<typeof useTranslations>) {
  switch (source) {
    case "AI_GENERATED":
      return t("sourceAiGenerated");
    case "LEGACY_DRAFT_CHECKPOINT":
      return t("sourceLegacyCheckpoint");
    case "CREATOR_ACCEPTED":
      return t("sourceCreatorAccepted");
  }
}

function directionDetail(
  direction: PerformanceDirection | EditDirection,
  t: ReturnType<typeof useTranslations>,
): string | null {
  switch (direction.type) {
    case "PAUSE":
      return t(`directionValue${direction.duration}`);
    case "EMPHASIS":
      return t(`directionValue${direction.strength}`);
    case "DELIVERY":
      return [direction.tone, direction.pace]
        .filter(Boolean)
        .map((value) => t(`directionValue${value}`))
        .join(" · ");
    case "GESTURE":
      return t(`directionValue${direction.kind}`);
    case "POSITION":
      return t(`directionValue${direction.action}`);
    case "GAZE":
      return t(`directionValue${direction.target}`);
    case "PERFORMANCE_NOTE":
    case "EDIT_NOTE":
      return direction.text || null;
    case "TEXT_OVERLAY":
      return direction.text;
    case "ZOOM":
      return `${t(`directionValue${direction.mode}`)} · ${t(`directionValue${direction.intensity}`)}`;
    case "CUT":
      return t(`directionValue${direction.style}`);
    case "BROLL_CUE":
      return direction.description;
    case "SOUND_CUE":
      return `${t(`directionValue${direction.kind}`)} · ${direction.description}`;
    case "CAPTION_EMPHASIS":
      return t(`directionValue${direction.style}`);
  }
}

function DirectionPreview({
  direction,
  contentLanguage,
}: Readonly<{
  direction: PerformanceDirection | EditDirection;
  contentLanguage: "en" | "fa";
}>) {
  const t = useTranslations("Content");
  const detail = directionDetail(direction, t);
  return (
    <li className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm">
      <span className="font-medium">{t(`directionType${direction.type}`)}</span>
      {detail ? (
        <span
          className="ms-2 break-words"
          dir={contentLanguage === "fa" ? "rtl" : "ltr"}
          lang={contentLanguage}
        >
          {detail}
        </span>
      ) : null}
    </li>
  );
}

function DirectionGroup({
  title,
  directions,
  contentLanguage,
}: Readonly<{
  title: string;
  directions: readonly (PerformanceDirection | EditDirection)[];
  contentLanguage: "en" | "fa";
}>) {
  if (!directions.length) return null;
  return (
    <section className="mt-4" aria-label={title}>
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      <ul className="mt-2 grid gap-2">
        {directions.map((direction) => (
          <DirectionPreview
            contentLanguage={contentLanguage}
            direction={direction}
            key={direction.id}
          />
        ))}
      </ul>
    </section>
  );
}

function V2Preview({
  document,
  contentLanguage,
}: Readonly<{ document: ContentDocumentV2; contentLanguage: "en" | "fa" }>) {
  const t = useTranslations("Content");
  const direction = contentLanguage === "fa" ? "rtl" : "ltr";
  return (
    <ol className="grid gap-4" aria-label={t("historicalScript")}>
      {document.script.blocks.map((block, index) => (
        <li className="rounded-xl border border-border/70 bg-background p-4" key={block.id}>
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="pt-1 text-xs tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <p
              className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-7"
              dir={direction}
              lang={contentLanguage}
            >
              {block.text || t("emptyScriptBlock")}
            </p>
          </div>
          <DirectionGroup
            contentLanguage={contentLanguage}
            directions={block.performanceDirections}
            title={t("performanceDirections")}
          />
          <DirectionGroup
            contentLanguage={contentLanguage}
            directions={block.editDirections}
            title={t("editDirections")}
          />
        </li>
      ))}
    </ol>
  );
}

function VersionPreview({
  version,
  contentLanguage,
}: Readonly<{ version: ContentVersionDto; contentLanguage: "en" | "fa" }>) {
  const t = useTranslations("Content");
  const direction = contentLanguage === "fa" ? "rtl" : "ltr";
  if (version.document.schemaVersion === 1) {
    return (
      <p
        className="rounded-xl border border-border/70 bg-background p-4 whitespace-pre-wrap break-words leading-7"
        dir={direction}
        lang={contentLanguage}
      >
        {version.document.script.text || t("emptyScript")}
      </p>
    );
  }
  return <V2Preview contentLanguage={contentLanguage} document={version.document} />;
}

export function ContentVersionHistory({ versions, acceptedVersionId, contentLanguage }: Props) {
  const t = useTranslations("Content");
  const locale = useLocale();
  const uiDirection = locale === "fa" ? "rtl" : "ltr";
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = versions.find((version) => version.id === selectedId) ?? null;

  const openHistory = () => {
    setSelectedId(acceptedVersionId ?? versions[0]?.id ?? null);
    setOpen(true);
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        aria-label={t("openVersionHistory")}
        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={openHistory}
        type="button"
      >
        <HistoryIcon aria-hidden="true" />
        {t("versionHistory")}
      </DialogTrigger>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport className="items-end p-0 sm:items-center sm:p-4">
          <DialogContent
            aria-label={t("versionHistory")}
            className="max-h-[92dvh] max-w-4xl overflow-hidden rounded-b-none rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] sm:rounded-2xl"
            dir={uiDirection}
          >
            <DialogHeader className="border-b border-border px-5 py-5 sm:px-7">
              <DialogTitle>{t("versionHistory")}</DialogTitle>
              <DialogDescription>{t("versionHistoryDescription")}</DialogDescription>
            </DialogHeader>
            <div className="grid min-h-0 overflow-y-auto md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
              <nav
                className="border-b border-border p-3 md:border-e md:border-b-0"
                aria-label={t("versionListLabel")}
              >
                {versions.length ? (
                  <ol className="grid gap-1">
                    {versions.map((version) => (
                      <li key={version.id}>
                        <button
                          aria-pressed={version.id === selectedId}
                          className="w-full rounded-lg px-3 py-3 text-start transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted"
                          onClick={() => setSelectedId(version.id)}
                          type="button"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-semibold tabular-nums">
                              {t("versionNumber", { version: version.versionNumber })}
                            </span>
                            {version.isCurrentAccepted ? (
                              <Badge variant="outline">{t("currentlyAccepted")}</Badge>
                            ) : null}
                          </span>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            {sourceLabel(version.source, t)}
                          </span>
                          <time
                            className="mt-1 block text-xs text-muted-foreground"
                            dateTime={version.createdAt.toISOString()}
                          >
                            {formatVersionDate(version.createdAt, locale)}
                          </time>
                          {version.createdByName ? (
                            <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {t("createdBy", { name: version.createdByName })}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="p-3 text-sm text-muted-foreground">{t("historyEmpty")}</p>
                )}
              </nav>
              <section
                className="min-w-0 p-5 sm:p-7"
                aria-labelledby="historical-version-preview-title"
                aria-live="polite"
              >
                {selected ? (
                  <>
                    <header className="border-b border-border pb-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className="text-xl font-semibold tracking-tight"
                          id="historical-version-preview-title"
                        >
                          {t("versionNumber", { version: selected.versionNumber })}
                        </h3>
                        <Badge variant="secondary">{t("readOnlyVersion")}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {sourceLabel(selected.source, t)} ·{" "}
                        {formatVersionDate(selected.createdAt, locale)}
                      </p>
                    </header>
                    <div className="mt-5">
                      <VersionPreview contentLanguage={contentLanguage} version={selected} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("selectVersion")}</p>
                )}
              </section>
            </div>
            <DialogFooter className="border-t border-border px-5 py-4 sm:px-7">
              <DialogClose className="min-h-10 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                {t("returnToDraft")}
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}
