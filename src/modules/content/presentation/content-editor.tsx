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

import { useUnsavedChanges } from "@/components/navigation/unsaved-changes-provider";
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
import { getContentDraftAction, saveContentDraftAction } from "../application/content-actions";
import type { ContentDetailDto } from "../application/content-read-service";
import { StructuredScriptEditor } from "./structured-script-editor";
import {
  useContentDraftAutosave,
  type AutosaveReloadResult,
  type AutosaveSaveInput,
} from "./use-content-draft-autosave";

type Props = Readonly<{ content: ContentDetailDto; workspaceId: string }>;
const icons = {
  unsaved: FilePenLineIcon,
  saving: LoaderCircleIcon,
  saved: CheckCircle2Icon,
  failed: AlertCircleIcon,
  conflict: AlertCircleIcon,
} as const;
function initialDocument(draft: ContentDetailDto["draft"]) {
  if (draft.document.schemaVersion === 2) return draft.document;
  if (draft.v2Projection) return draft.v2Projection;
  throw new Error("The legacy Content Draft projection is unavailable.");
}
function presentation(language: ContentDetailDto["contentLanguage"]) {
  return language === "fa" ? "rtl" : "ltr";
}

export function ContentEditor({ content, workspaceId }: Props) {
  const t = useTranslations("Content");
  const dir = presentation(content.contentLanguage);
  const save = useCallback((input: AutosaveSaveInput) => saveContentDraftAction(input), []);
  const reload = useCallback(async (): Promise<AutosaveReloadResult> => {
    const result = await getContentDraftAction({ workspaceId, contentId: content.id });
    return result.ok ? { ok: true, draft: result.content.draft } : { ok: false, code: result.code };
  }, [content.id, workspaceId]);
  const autosave = useContentDraftAutosave({
    contentId: content.id,
    initialDocument: initialDocument(content.draft),
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
  const Icon = icons[autosave.status];
  const variant =
    autosave.status === "saved"
      ? "default"
      : autosave.status === "failed" || autosave.status === "conflict"
        ? "destructive"
        : autosave.status === "saving"
          ? "secondary"
          : "outline";
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
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("sourceIdea")}
            </dt>
            <dd className="mt-1 break-words font-medium" dir={dir} lang={content.contentLanguage}>
              {content.sourceIdea.title}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("format")}
            </dt>
            <dd className="mt-1 font-medium">
              {content.format === "SHORT_VIDEO" ? t("shortVideo") : t("longVideo")}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("contentLanguage")}
            </dt>
            <dd className="mt-1 font-medium" dir={dir} lang={content.contentLanguage}>
              {content.contentLanguage === "fa" ? t("persian") : t("english")}
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
          <StructuredScriptEditor
            disabled={autosave.status === "conflict"}
            document={autosave.document}
            language={content.contentLanguage}
            labels={{
              region: t("scriptLabel"),
              block: t("scriptBlock"),
              add: t("addScriptBlock"),
              moveUp: t("moveBlockUp"),
              moveDown: t("moveBlockDown"),
              remove: t("deleteBlock"),
              deleteTitle: t("deleteBlockTitle"),
              deleteDescription: t("deleteBlockDescription"),
              cancel: t("cancel"),
              confirm: t("confirmDeleteBlock"),
            }}
            onChange={autosave.onChange}
          />
          <p className="mt-3 text-sm text-muted-foreground" id="content-script-help">
            {t("scriptHelp")}
          </p>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div
            aria-atomic="true"
            className="flex flex-wrap items-center gap-2 text-sm"
            role="status"
          >
            <span className="text-muted-foreground">{t("saveStatus")}:</span>
            <Badge variant={variant}>
              <Icon
                aria-hidden="true"
                className={autosave.status === "saving" ? "motion-safe:animate-spin" : undefined}
              />
              {t(
                autosave.status === "unsaved"
                  ? "unsaved"
                  : autosave.status === "saving"
                    ? "saving"
                    : autosave.status === "saved"
                      ? "saved"
                      : autosave.status === "failed"
                        ? "saveFailed"
                        : "conflict",
              )}
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
