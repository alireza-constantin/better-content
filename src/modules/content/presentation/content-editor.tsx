"use client";

import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  ClipboardIcon,
  FilePenLineIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SaveIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChanges } from "@/components/navigation/unsaved-changes-provider";
import { getContentDraftAction, saveContentDraftAction } from "../application/content-actions";
import type { ContentDetailDto } from "../application/content-read-service";
import {
  useContentDraftAutosave,
  type AutosaveReloadResult,
  type AutosaveSaveInput,
} from "./use-content-draft-autosave";

type ContentEditorProps = Readonly<{
  content: ContentDetailDto;
  workspaceId: string;
}>;

function contentPresentation(language: ContentDetailDto["contentLanguage"]): Readonly<{
  dir: "ltr" | "rtl";
}> {
  return language === "fa" ? { dir: "rtl" } : { dir: "ltr" };
}

function formatLabel(
  t: ReturnType<typeof useTranslations>,
  format: ContentDetailDto["format"],
): string {
  return format === "SHORT_VIDEO" ? t("shortVideo") : t("longVideo");
}

function languageLabel(
  t: ReturnType<typeof useTranslations>,
  language: ContentDetailDto["contentLanguage"],
): string {
  return language === "fa" ? t("persian") : t("english");
}

const STATUS_ICONS = {
  unsaved: FilePenLineIcon,
  saving: LoaderCircleIcon,
  saved: CheckCircle2Icon,
  failed: AlertCircleIcon,
  conflict: AlertCircleIcon,
} as const;

function statusVariant(
  status: ReturnType<typeof useContentDraftAutosave>["status"],
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "saved":
      return "default";
    case "saving":
      return "secondary";
    case "unsaved":
      return "outline";
    case "failed":
    case "conflict":
      return "destructive";
  }
}

function statusLabel(
  t: ReturnType<typeof useTranslations>,
  status: ReturnType<typeof useContentDraftAutosave>["status"],
): string {
  switch (status) {
    case "unsaved":
      return t("unsaved");
    case "saving":
      return t("saving");
    case "saved":
      return t("saved");
    case "failed":
      return t("saveFailed");
    case "conflict":
      return t("conflict");
  }
}

export function ContentEditor({ content, workspaceId }: ContentEditorProps) {
  const t = useTranslations("Content");
  const presentation = contentPresentation(content.contentLanguage);
  const save = useCallback((input: AutosaveSaveInput) => saveContentDraftAction(input), []);
  const reload = useCallback(async (): Promise<AutosaveReloadResult> => {
    const result = await getContentDraftAction({ workspaceId, contentId: content.id });

    if (!result.ok) {
      return { ok: false, code: result.code };
    }

    return { ok: true, draft: result.content.draft };
  }, [content.id, workspaceId]);
  const autosave = useContentDraftAutosave({
    contentId: content.id,
    initialDocument: content.draft.document,
    initialRevision: content.draft.revision,
    reload,
    save,
    workspaceId,
  });
  const reportDirty = useUnsavedChanges();
  useEffect(() => {
    reportDirty(autosave.isDirty);

    return () => reportDirty(false);
  }, [autosave.isDirty, reportDirty]);
  const StatusIcon = STATUS_ICONS[autosave.status];

  return (
    <article
      aria-busy={autosave.isSaving || autosave.isReloading}
      className="mt-8 flex flex-col gap-6"
      data-content-language={content.contentLanguage}
      data-testid="content-editor"
    >
      <section aria-labelledby="content-source-context-title">
        <h2 className="text-xl font-semibold tracking-tight" id="content-source-context-title">
          {t("sourceIdeaContext")}
        </h2>
        <dl className="mt-4 grid gap-4 border-b border-border pb-8 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("sourceIdea")}
            </dt>
            <dd
              className="mt-1 break-words font-medium text-foreground"
              dir={presentation.dir}
              lang={content.contentLanguage}
            >
              {content.sourceIdea.title}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("format")}
            </dt>
            <dd className="mt-1 font-medium text-foreground">{formatLabel(t, content.format)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("contentLanguage")}
            </dt>
            <dd
              className="mt-1 font-medium text-foreground"
              dir={presentation.dir}
              lang={content.contentLanguage}
            >
              {languageLabel(t, content.contentLanguage)}
            </dd>
          </div>
        </dl>
      </section>

      {autosave.status === "failed" ? (
        <Alert aria-live="assertive" variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{t("saveFailedTitle")}</AlertTitle>
          <AlertDescription>{t("saveFailedDescription")}</AlertDescription>
        </Alert>
      ) : null}

      {autosave.status === "conflict" ? (
        <Alert aria-live="assertive" variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{t("conflictTitle")}</AlertTitle>
          <AlertDescription>
            <p>{t("conflictDescription")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                className="min-h-11"
                disabled={autosave.isReloading || autosave.isCopying}
                onClick={() => void autosave.reload()}
                type="button"
                variant="outline"
              >
                <RefreshCwIcon data-icon="inline-start" />
                {autosave.isReloading ? t("reloadingDraft") : t("reloadDraft")}
              </Button>
              <Button
                className="min-h-11"
                disabled={autosave.isReloading || autosave.isCopying}
                onClick={() => void autosave.copyUnsaved()}
                type="button"
                variant="outline"
              >
                {autosave.isCopying ? (
                  <LoaderCircleIcon data-icon="inline-start" />
                ) : autosave.copyFeedback === "copied" ? (
                  <ClipboardCheckIcon data-icon="inline-start" />
                ) : (
                  <ClipboardIcon data-icon="inline-start" />
                )}
                {autosave.isCopying ? t("copyingUnsaved") : t("copyUnsaved")}
              </Button>
            </div>
            {autosave.reloadError ? (
              <p className="mt-3 text-sm" role="alert">
                <span className="font-medium">{t("reloadFailedTitle")}</span>{" "}
                {t("reloadFailedDescription")}
              </p>
            ) : null}
            {autosave.copyFeedback === "copied" ? (
              <p className="mt-3 text-sm" role="status">
                {t("copiedUnsaved")}
              </p>
            ) : autosave.copyFeedback === "failed" ? (
              <p className="mt-3 text-sm" role="alert">
                {t("copyFailed")}
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-xl font-semibold tracking-tight" id="content-script-title">
              {t("scriptTitle")}
            </h2>
          </CardTitle>
          <CardDescription>{t("scriptDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="content-script-text">{t("scriptLabel")}</FieldLabel>
            <Textarea
              aria-describedby="content-script-help"
              className="min-h-[28rem] resize-y text-base leading-7"
              dir={presentation.dir}
              id="content-script-text"
              lang={content.contentLanguage}
              maxLength={50_000}
              onChange={(event) => autosave.onChange(event.target.value)}
              spellCheck
              value={autosave.text}
            />
            <FieldDescription id="content-script-help">{t("scriptHelp")}</FieldDescription>
          </Field>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div
            aria-atomic="true"
            aria-live="polite"
            className="flex flex-wrap items-center gap-2 text-sm"
            role="status"
          >
            <span className="text-muted-foreground">{t("saveStatus")}:</span>
            <Badge variant={statusVariant(autosave.status)}>
              <StatusIcon
                aria-hidden="true"
                className={autosave.status === "saving" ? "motion-safe:animate-spin" : undefined}
              />
              {statusLabel(t, autosave.status)}
            </Badge>
            <span className="text-muted-foreground">
              {t("revision", { revision: autosave.revision })}
            </span>
          </div>
          {autosave.status === "unsaved" || autosave.status === "failed" ? (
            <Button
              className="min-h-11 w-full sm:w-auto"
              disabled={autosave.isSaving}
              onClick={autosave.saveNow}
              type="button"
            >
              <SaveIcon data-icon="inline-start" />
              {autosave.status === "failed" ? t("retrySave") : t("saveNow")}
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    </article>
  );
}
