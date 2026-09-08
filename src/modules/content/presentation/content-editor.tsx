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
import { useCallback, useEffect, useState } from "react";

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
import {
  acceptContentAction,
  getContentDraftAction,
  saveContentDraftAction,
} from "../application/content-actions";
import type { ContentDetailDto } from "../application/content-read-service";
import { deriveContentAcceptanceState, exportContentDocumentV3Recovery } from "../domain";
import type { ContentDocumentV3 } from "../domain";
import { ContentVersionHistory } from "./content-version-history";
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
  return draft.editorDocument;
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
    recoveryExport: (document) =>
      exportContentDocumentV3Recovery(document, content.assetPresentations, {
        attachedMedia: t("historyAttachedMedia"),
        unavailable: t("assetUnavailable"),
      }),
  });
  const [acceptedVersionId, setAcceptedVersionId] = useState(content.acceptedVersionId);
  const [versions, setVersions] = useState(content.versions);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState<"CONFLICT" | "OTHER" | null>(null);
  const [acceptanceSuccess, setAcceptanceSuccess] = useState(false);
  const acceptedVersion = versions.find((version) => version.id === acceptedVersionId);
  const acceptanceState = deriveContentAcceptanceState({
    acceptedVersionId,
    acceptedDocument: acceptedVersion?.document ?? null,
    draftDocument: autosave.document,
  });
  const acceptanceUnavailableReason =
    autosave.status === "saving" || autosave.isSaving
      ? t("acceptanceUnavailableSaving")
      : autosave.status === "failed"
        ? t("acceptanceUnavailableFailed")
        : autosave.status === "conflict"
          ? t("acceptanceUnavailableConflict")
          : autosave.isDirty
            ? t("acceptanceUnavailableUnsaved")
            : null;
  const canAccept = acceptanceUnavailableReason === null && !isAccepting;
  const accept = async () => {
    if (!canAccept) return;
    setIsAccepting(true);
    setAcceptanceError(null);
    setAcceptanceSuccess(false);
    const result = await acceptContentAction({
      workspaceId,
      contentId: content.id,
      expectedDraftRevision: autosave.revision,
    });
    setIsAccepting(false);
    if (!result.ok) {
      setAcceptanceError(result.code === "CONFLICT" ? "CONFLICT" : "OTHER");
      return;
    }

    autosave.adoptPersistedDraft(result.result.draft);
    setAcceptedVersionId(result.result.acceptedVersion.id);
    setVersions((current) => {
      const existing = current.find((version) => version.id === result.result.acceptedVersion.id);
      const accepted = existing ?? result.result.acceptedVersion;
      return [
        { ...accepted, isCurrentAccepted: true },
        ...current
          .filter((version) => version.id !== accepted.id)
          .map((version) => ({ ...version, isCurrentAccepted: false })),
      ].sort((left, right) => right.versionNumber - left.versionNumber);
    });
    setAcceptanceSuccess(true);
  };
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
      <section
        aria-labelledby="content-acceptance-title"
        className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold" id="content-acceptance-title">
            {t("acceptanceTitle")}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2" role="status">
            <Badge variant={acceptanceState === "NOT_ACCEPTED" ? "outline" : "secondary"}>
              {t(
                acceptanceState === "NOT_ACCEPTED"
                  ? "acceptanceNotAccepted"
                  : acceptanceState === "ACCEPTED"
                    ? "acceptanceAccepted"
                    : "acceptanceUnacceptedChanges",
              )}
            </Badge>
            <span className="text-sm text-muted-foreground">{t("acceptanceDescription")}</span>
          </div>
          {acceptanceUnavailableReason ? (
            <p className="mt-2 text-xs text-muted-foreground" id="content-acceptance-help">
              {acceptanceUnavailableReason}
            </p>
          ) : null}
          {acceptanceSuccess ? (
            <p aria-live="polite" className="mt-2 text-sm text-foreground" role="status">
              {t("acceptanceSuccess")}
            </p>
          ) : null}
          {acceptanceError ? (
            <p aria-live="assertive" className="mt-2 text-sm text-destructive" role="alert">
              {t(acceptanceError === "CONFLICT" ? "acceptanceConflict" : "acceptanceFailed")}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            aria-describedby={acceptanceUnavailableReason ? "content-acceptance-help" : undefined}
            className="min-h-10"
            disabled={!canAccept}
            onClick={() => void accept()}
            type="button"
          >
            {isAccepting ? t("accepting") : t("acceptDraft")}
          </Button>
          <ContentVersionHistory
            acceptedVersionId={acceptedVersionId}
            contentLanguage={content.contentLanguage}
            assetPresentations={content.assetPresentations}
            versions={versions}
          />
        </div>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight" id="content-script-title">
                {t("scriptTitle")}
              </h2>
              <Badge variant="outline">{t("currentDraftEditable")}</Badge>
            </div>
          </CardTitle>
          <CardDescription>{t("scriptDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <StructuredScriptEditor
            disabled={autosave.status === "conflict"}
            document={autosave.document as ContentDocumentV3}
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
            workspaceId={workspaceId}
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
