"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, InfoIcon, RefreshCwIcon, SaveIcon, ShieldCheckIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { CurrentContentDnaDto } from "@/modules/dna/application";
import {
  loadCurrentContentDnaAction,
  saveContentDnaAction,
} from "@/modules/dna/application/save-content-dna-action";

import {
  createContentDnaEditorSchema,
  editorValuesFromPayload,
  payloadFromEditorValues,
  type ContentDnaEditorValues,
} from "./content-dna-editor-form";
import {
  AudienceSection,
  ExpertiseSection,
  GoalsSection,
  IdentitySection,
  LanguageSection,
  PreferencesSection,
  VoiceSection,
} from "./content-dna-editor-sections";
import { useUnsavedContentDnaWarning } from "./use-unsaved-content-dna-warning";

type ApplicationError = "CONFLICT" | "GENERIC" | "RELOAD_ERROR" | null;

export function ContentDnaEditor({
  initialContentDna,
  workspaceId,
}: Readonly<{ initialContentDna: CurrentContentDnaDto; workspaceId: string }>) {
  const t = useTranslations("ContentDna");
  const locale = useLocale();
  const schema = useMemo(
    () =>
      createContentDnaEditorSchema((key, values) =>
        t(key as Parameters<typeof t>[0], values as Parameters<typeof t>[1]),
      ),
    [t],
  );
  const form = useForm<ContentDnaEditorValues>({
    resolver: zodResolver(schema),
    defaultValues: editorValuesFromPayload(initialContentDna.currentVersion?.payload),
    mode: "onSubmit",
  });
  const [baseVersionId, setBaseVersionId] = useState(initialContentDna.currentVersion?.id ?? null);
  const [versionNumber, setVersionNumber] = useState(
    initialContentDna.currentVersion?.versionNumber ?? null,
  );
  const [readiness, setReadiness] = useState(initialContentDna.status);
  const [applicationError, setApplicationError] = useState<ApplicationError>(null);
  const [isReloading, setIsReloading] = useState(false);
  const { isDirty, isSubmitting } = form.formState;

  useUnsavedContentDnaWarning(isDirty);

  const handleSave = form.handleSubmit(async (values) => {
    setApplicationError(null);
    form.clearErrors("root");
    let result: Awaited<ReturnType<typeof saveContentDnaAction>>;

    try {
      result = await saveContentDnaAction({
        workspaceId,
        baseVersionId,
        payload: payloadFromEditorValues(values),
      });
    } catch {
      setApplicationError("GENERIC");
      return;
    }

    if (!result.ok) {
      if (result.code === "CONFLICT") setApplicationError("CONFLICT");
      else if (result.code === "VALIDATION_ERROR") {
        form.setError("root.server", { type: "server", message: t("validation") });
      } else setApplicationError("GENERIC");
      return;
    }

    setBaseVersionId(result.version.id);
    setVersionNumber(result.version.versionNumber);
    setReadiness(result.version.readiness);
    form.reset(editorValuesFromPayload(result.version.payload));
  });

  const handleReloadLatest = async () => {
    if (isReloading) return;

    setApplicationError(null);
    setIsReloading(true);
    let result: Awaited<ReturnType<typeof loadCurrentContentDnaAction>>;

    try {
      result = await loadCurrentContentDnaAction(workspaceId);
    } catch {
      setApplicationError("RELOAD_ERROR");
      setIsReloading(false);
      return;
    }

    if (!result.ok) {
      setApplicationError("RELOAD_ERROR");
      setIsReloading(false);
      return;
    }

    const currentVersion = result.current.currentVersion;
    setBaseVersionId(currentVersion?.id ?? null);
    setVersionNumber(currentVersion?.versionNumber ?? null);
    setReadiness(result.current.status);
    form.reset(editorValuesFromPayload(currentVersion?.payload));
    setIsReloading(false);
  };

  return (
    <FormProvider {...form}>
      <form
        aria-label={t("editorFormLabel")}
        className="mt-10 flex flex-col gap-8"
        dir={locale === "fa" ? "rtl" : "ltr"}
        noValidate
        onSubmit={handleSave}
      >
        <div className="flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex max-w-2xl flex-col gap-2">
              <h2 className="text-xl font-semibold tracking-tight">
                {baseVersionId ? t("editorTitleExisting") : t("emptyTitle")}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {baseVersionId ? t("editorDescriptionExisting") : t("emptyDescription")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2" aria-live="polite">
              <Badge
                variant={
                  readiness === "AI_READY"
                    ? "default"
                    : readiness === "NOT_CREATED"
                      ? "outline"
                      : "secondary"
                }
              >
                {readiness === "AI_READY"
                  ? t("aiReady")
                  : readiness === "NOT_CREATED"
                    ? t("notCreated")
                    : t("incomplete")}
              </Badge>
              {versionNumber && (
                <Badge variant="outline">{t("version", { version: versionNumber })}</Badge>
              )}
            </div>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="text-muted-foreground">{t("statusDescription")}</span>
            {isDirty ? (
              <span className="font-medium text-foreground" role="status">
                {t("unsaved")}
              </span>
            ) : baseVersionId ? (
              <span className="text-muted-foreground" role="status">
                {t("saved")}
              </span>
            ) : null}
          </div>
        </div>

        <div className="sticky top-3 z-10 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {isDirty ? t("saveBarUnsaved") : t("saveBarClean")}
            </p>
            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="min-h-11 w-full sm:w-auto"
            >
              <SaveIcon data-icon="inline-start" />
              {isSubmitting ? t("saving") : t("save")}
            </Button>
          </div>
        </div>

        <Alert role="note">
          <ShieldCheckIcon />
          <AlertTitle>{t("privacyTitle")}</AlertTitle>
          <AlertDescription>{t("privacyDescription")}</AlertDescription>
        </Alert>

        {applicationError === "CONFLICT" && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{t("conflictTitle")}</AlertTitle>
            <AlertDescription>
              <p>{t("conflict")}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-2 min-h-11"
                disabled={isReloading}
                onClick={handleReloadLatest}
              >
                <RefreshCwIcon data-icon="inline-start" />
                {isReloading ? t("reloading") : t("reloadLatest")}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {applicationError === "RELOAD_ERROR" && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{t("reloadErrorTitle")}</AlertTitle>
            <AlertDescription>
              <p>{t("reloadError")}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-2 min-h-11"
                disabled={isReloading}
                onClick={handleReloadLatest}
              >
                <RefreshCwIcon data-icon="inline-start" />
                {isReloading ? t("reloading") : t("reloadLatest")}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {applicationError === "GENERIC" && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{t("genericErrorTitle")}</AlertTitle>
            <AlertDescription>{t("genericError")}</AlertDescription>
          </Alert>
        )}

        {form.formState.errors.root?.server && (
          <Alert variant="destructive">
            <InfoIcon />
            <AlertTitle>{t("validationTitle")}</AlertTitle>
            <AlertDescription>{form.formState.errors.root.server.message}</AlertDescription>
          </Alert>
        )}

        <IdentitySection />
        <AudienceSection />
        <ExpertiseSection />
        <VoiceSection />
        <GoalsSection />
        <PreferencesSection />
        <LanguageSection />
      </form>
    </FormProvider>
  );
}
