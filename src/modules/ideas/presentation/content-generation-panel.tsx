"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Clock3Icon,
  LoaderCircleIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogPortal,
  DialogTitle,
  DialogViewport,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RateLimitSource } from "@/lib/errors/app-error";
import { Link } from "@/i18n/navigation";
import type {
  ContentGenerationAttemptHistoryDto,
  IdeaContentGenerationHistoryDto,
} from "@/modules/content/application/content-read-service";

import type { IdeasDnaSummary, IdeasLanguage } from "./ideas-types";

export const contentGenerationFormSchema = z
  .object({
    requestedLanguage: z.enum(["en", "fa"]),
    format: z.enum(["SHORT_VIDEO", "LONG_VIDEO"]),
    instructions: z.string().max(1_000),
  })
  .strict();

export type ContentGenerationFormValues = z.infer<typeof contentGenerationFormSchema>;

export type ContentGenerationNotice = Readonly<{
  code: string;
  rateLimitSource?: RateLimitSource;
}>;

function formatAttemptDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function languageLabel(t: ReturnType<typeof useTranslations>, language: IdeasLanguage): string {
  return language === "fa" ? t("languagePersian") : t("languageEnglish");
}

function formatLabel(
  t: ReturnType<typeof useTranslations>,
  format: ContentGenerationAttemptHistoryDto["format"],
): string {
  return format === "SHORT_VIDEO" ? t("shortVideo") : t("longVideo");
}

function lifecycleLabel(
  t: ReturnType<typeof useTranslations>,
  status: ContentGenerationAttemptHistoryDto["status"],
): string {
  switch (status) {
    case "PENDING":
      return t("statusPending");
    case "RUNNING":
      return t("statusRunning");
    case "COMPLETED":
      return t("statusCompleted");
    case "FAILED":
      return t("statusFailed");
  }
}

function ContentAttemptStatusBadge({
  status,
}: Readonly<{ status: ContentGenerationAttemptHistoryDto["status"] }>) {
  const t = useTranslations("Ideas");
  const Icon =
    status === "COMPLETED"
      ? CheckCircle2Icon
      : status === "FAILED"
        ? AlertCircleIcon
        : status === "RUNNING"
          ? LoaderCircleIcon
          : Clock3Icon;

  return (
    <Badge
      variant={
        status === "FAILED" ? "destructive" : status === "COMPLETED" ? "default" : "secondary"
      }
    >
      <Icon
        aria-hidden="true"
        className={status === "RUNNING" ? "motion-safe:animate-spin" : undefined}
      />
      {lifecycleLabel(t, status)}
    </Badge>
  );
}

function contentAttemptFailureDescription(
  t: ReturnType<typeof useTranslations>,
  errorCategory: ContentGenerationAttemptHistoryDto["errorCategory"],
  rateLimitSource: ContentGenerationAttemptHistoryDto["rateLimitSource"],
): string {
  switch (errorCategory) {
    case "RATE_LIMITED":
      return rateLimitSource === "workspace"
        ? t("contentFailureWorkspaceRateLimited")
        : t("contentFailureProviderRateLimited");
    case "INVALID_OUTPUT":
      return t("contentFailureInvalidOutput");
    case "TIMEOUT":
      return t("contentFailureTimeout");
    case "PROVIDER_UNAVAILABLE":
      return t("contentFailureProviderUnavailable");
    case "INTERRUPTED":
      return t("contentFailureInterrupted");
    default:
      return t("contentFailureUnknown");
  }
}

function contentActionErrorCopy(
  t: ReturnType<typeof useTranslations>,
  code: string,
  rateLimitSource?: RateLimitSource,
): Readonly<{ title: string; description: string }> {
  switch (code) {
    case "CONFLICT":
      return { title: t("contentConflictTitle"), description: t("contentConflictDescription") };
    case "RATE_LIMITED":
      return rateLimitSource === "provider"
        ? {
            title: t("contentProviderRateLimitedTitle"),
            description: t("contentProviderRateLimitedDescription"),
          }
        : {
            title: t("contentWorkspaceRateLimitedTitle"),
            description: t("contentWorkspaceRateLimitedDescription"),
          };
    case "AI_OUTPUT_INVALID":
      return {
        title: t("contentInvalidOutputTitle"),
        description: t("contentInvalidOutputDescription"),
      };
    case "VALIDATION_ERROR":
      return { title: t("contentValidationTitle"), description: t("contentValidationDescription") };
    case "PROVIDER_ERROR":
      return {
        title: t("contentProviderFailureTitle"),
        description: t("contentProviderFailureDescription"),
      };
    default:
      return {
        title: t("contentGenericErrorTitle"),
        description: t("contentGenericErrorDescription"),
      };
  }
}

export function ContentGenerationActionNotice({
  notice,
  onReload,
}: Readonly<{
  notice: ContentGenerationNotice | null;
  onReload: () => void;
}>) {
  const t = useTranslations("Ideas");

  if (!notice) {
    return null;
  }

  const copy = contentActionErrorCopy(t, notice.code, notice.rateLimitSource);

  return (
    <Alert className="mt-5" variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        <p>{copy.description}</p>
        {notice.code === "CONFLICT" ? (
          <Button className="mt-3 min-h-11" onClick={onReload} type="button" variant="outline">
            <RefreshCwIcon data-icon="inline-start" />
            {t("reloadCurrentState")}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function ContentAttemptHistory({
  activeRetryAttemptId,
  history,
  isBusy,
  onRetry,
}: Readonly<{
  activeRetryAttemptId?: string | null;
  history: IdeaContentGenerationHistoryDto | undefined;
  isBusy: boolean;
  onRetry: (attemptId: string) => void;
}>) {
  const t = useTranslations("Ideas");
  const locale = useLocale();

  if (!history || history.attempts.length === 0) {
    return null;
  }

  const historyTitleId = `script-history-${history.sourceIdea.id}`;

  return (
    <section className="mt-5 grid gap-3" aria-labelledby={historyTitleId}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold" id={historyTitleId}>
          {t("scriptGenerationHistory")}
        </h4>
        <span className="text-xs text-muted-foreground">
          {t("scriptAttemptCount", { count: history.attempts.length })}
        </span>
      </div>
      <ol className="grid gap-3">
        {history.attempts.map((attempt) => {
          const instructionsId = `script-attempt-instructions-${attempt.id}`;

          return (
            <li className="grid gap-3 rounded-lg border bg-muted/25 p-4" key={attempt.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <ContentAttemptStatusBadge status={attempt.status} />
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={attempt.createdAt.toISOString()}
                  suppressHydrationWarning
                >
                  {formatAttemptDate(attempt.createdAt, locale)}
                </time>
              </div>
              <p className="text-xs text-muted-foreground">
                <span>{languageLabel(t, attempt.requestedLanguage)}</span>
                <span aria-hidden="true"> · </span>
                <span>{formatLabel(t, attempt.format)}</span>
              </p>

              {attempt.instructions ? (
                <div className="grid gap-1.5">
                  <p className="text-xs font-medium text-foreground" id={instructionsId}>
                    {t("attemptInstructions")}
                  </p>
                  <p
                    aria-labelledby={instructionsId}
                    className="break-words whitespace-pre-wrap text-sm leading-6 text-muted-foreground"
                    dir="auto"
                  >
                    {attempt.instructions}
                  </p>
                </div>
              ) : null}

              {attempt.status === "PENDING" ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  {t("contentAttemptPendingDescription")}
                </p>
              ) : null}
              {attempt.status === "RUNNING" ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  {t("contentAttemptRunningDescription")}
                </p>
              ) : null}
              {attempt.status === "FAILED" ? (
                <div className="grid gap-3">
                  <p className="text-sm leading-6 text-destructive">
                    {contentAttemptFailureDescription(
                      t,
                      attempt.errorCategory,
                      attempt.rateLimitSource,
                    )}
                  </p>
                  <Button
                    className="min-h-11 w-fit"
                    disabled={isBusy}
                    onClick={() => onRetry(attempt.id)}
                    type="button"
                    variant="outline"
                  >
                    <RefreshCwIcon data-icon="inline-start" />
                    {activeRetryAttemptId === attempt.id
                      ? t("retryingScriptGeneration")
                      : t("retryScriptGeneration")}
                  </Button>
                </div>
              ) : null}
              {attempt.status === "COMPLETED" && attempt.resultingContentId ? (
                <Link
                  className="inline-flex min-h-11 w-fit items-center rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  href={`/content/${attempt.resultingContentId}`}
                >
                  {t("openGeneratedContent")}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function defaultRequestedLanguage(dna: IdeasDnaSummary): IdeasLanguage {
  const currentVersion = dna.currentVersion;

  if (
    currentVersion?.defaultContentLanguage &&
    currentVersion.contentLanguages.includes(currentVersion.defaultContentLanguage)
  ) {
    return currentVersion.defaultContentLanguage;
  }

  return currentVersion?.contentLanguages[0] ?? "en";
}

export function ContentGenerationDialog({
  idea,
  dna,
  isSubmitting,
  notice,
  onClose,
  onReload,
  onSubmit,
}: Readonly<{
  idea: Readonly<{ id: string; title: string; language: "en" | "fa" }> | null;
  dna: IdeasDnaSummary;
  isSubmitting: boolean;
  notice: ContentGenerationNotice | null;
  onClose: () => void;
  onReload: () => void;
  onSubmit: (values: ContentGenerationFormValues) => void;
}>) {
  const t = useTranslations("Ideas");
  const locale = useLocale();
  const currentVersion = dna.currentVersion;
  const defaultLanguage = defaultRequestedLanguage(dna);
  const ideaId = idea?.id;
  const languageTriggerRef = useRef<HTMLButtonElement | null>(null);
  const form = useForm<ContentGenerationFormValues>({
    resolver: zodResolver(contentGenerationFormSchema),
    defaultValues: {
      requestedLanguage: defaultLanguage,
      format: "SHORT_VIDEO",
      instructions: "",
    },
  });
  const instructions = useWatch({ control: form.control, name: "instructions" }) ?? "";
  const languageError = form.formState.errors.requestedLanguage;
  const formatError = form.formState.errors.format;
  const instructionsError = form.formState.errors.instructions;

  useEffect(() => {
    if (!ideaId) {
      return;
    }

    form.reset({
      requestedLanguage: defaultLanguage,
      format: "SHORT_VIDEO",
      instructions: "",
    });
    const focusTimer = window.setTimeout(() => languageTriggerRef.current?.focus(), 0);

    return () => window.clearTimeout(focusTimer);
  }, [currentVersion?.id, defaultLanguage, form, ideaId]);

  if (!idea || !currentVersion) {
    return null;
  }

  const uiDirection = locale === "fa" ? "rtl" : "ltr";
  const instructionsField = form.register("instructions");

  return (
    <Dialog
      disablePointerDismissal={isSubmitting}
      open={Boolean(idea)}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) {
          onClose();
        }
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogContent aria-busy={isSubmitting} dir={uiDirection}>
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("generateScriptEyebrow")}
                </p>
                <DialogTitle className="mt-2">{t("generateScriptDialogTitle")}</DialogTitle>
              </div>
              <DialogClose
                aria-label={t("cancel")}
                className="inline-flex size-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                disabled={isSubmitting}
              >
                <XIcon aria-hidden="true" className="size-4" />
              </DialogClose>
            </div>
            <DialogDescription className="mt-4">
              {t("generateScriptDialogDescription")}
            </DialogDescription>
            <p
              className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm font-medium"
              dir={idea.language === "fa" ? "rtl" : "ltr"}
              lang={idea.language}
            >
              {idea.title}
            </p>

            {notice ? (
              <Alert className="mt-5" variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>
                  {contentActionErrorCopy(t, notice.code, notice.rateLimitSource).title}
                </AlertTitle>
                <AlertDescription>
                  <p>
                    {contentActionErrorCopy(t, notice.code, notice.rateLimitSource).description}
                  </p>
                  {notice.code === "CONFLICT" ? (
                    <Button
                      className="mt-3 min-h-11"
                      onClick={onReload}
                      type="button"
                      variant="outline"
                    >
                      <RefreshCwIcon data-icon="inline-start" />
                      {t("reloadCurrentState")}
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            <form
              aria-busy={isSubmitting}
              className="mt-6 grid gap-6"
              noValidate
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <FieldGroup>
                <Controller
                  control={form.control}
                  name="requestedLanguage"
                  render={({ field }) => (
                    <Field data-invalid={Boolean(languageError)}>
                      <FieldLabel htmlFor="generate-script-language">
                        {t("scriptLanguageLabel")}
                      </FieldLabel>
                      <Select
                        disabled={isSubmitting}
                        dir={uiDirection}
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          aria-describedby={`generate-script-language-help${languageError ? " generate-script-language-error" : ""}`}
                          aria-invalid={Boolean(languageError)}
                          className="min-h-11 w-full"
                          id="generate-script-language"
                          ref={(element) => {
                            field.ref(element);
                            languageTriggerRef.current = element;
                          }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currentVersion.contentLanguages.map((language) => (
                            <SelectItem key={language} value={language}>
                              {languageLabel(t, language)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription id="generate-script-language-help">
                        {t("scriptLanguageHelp")}
                      </FieldDescription>
                      <FieldError
                        id="generate-script-language-error"
                        errors={
                          languageError
                            ? [{ message: t("contentValidationDescription") }]
                            : undefined
                        }
                      />
                    </Field>
                  )}
                />

                <Controller
                  control={form.control}
                  name="format"
                  render={({ field }) => (
                    <Field data-invalid={Boolean(formatError)}>
                      <FieldLabel htmlFor="generate-script-format">{t("formatLabel")}</FieldLabel>
                      <Select
                        disabled={isSubmitting}
                        dir={uiDirection}
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          aria-describedby={`generate-script-format-help${formatError ? " generate-script-format-error" : ""}`}
                          aria-invalid={Boolean(formatError)}
                          className="min-h-11 w-full"
                          id="generate-script-format"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SHORT_VIDEO">{t("shortVideo")}</SelectItem>
                          <SelectItem value="LONG_VIDEO">{t("longVideo")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FieldDescription id="generate-script-format-help">
                        {t("formatHelp")}
                      </FieldDescription>
                      <FieldError
                        id="generate-script-format-error"
                        errors={
                          formatError ? [{ message: t("contentValidationDescription") }] : undefined
                        }
                      />
                    </Field>
                  )}
                />

                <Field data-invalid={Boolean(instructionsError)}>
                  <FieldLabel htmlFor="generate-script-instructions">
                    {t("instructionsLabel")}
                  </FieldLabel>
                  <Textarea
                    aria-describedby={`generate-script-instructions-help${instructionsError ? " generate-script-instructions-error" : ""}`}
                    aria-invalid={Boolean(instructionsError)}
                    className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-28 w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isSubmitting}
                    dir="auto"
                    id="generate-script-instructions"
                    maxLength={1_000}
                    placeholder={t("instructionsPlaceholder")}
                    {...instructionsField}
                  />
                  <FieldDescription id="generate-script-instructions-help">
                    {t("instructionsHelp")}
                  </FieldDescription>
                  <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                    {t("instructionsCharacterCount", { count: instructions.length })}
                  </p>
                  <FieldError
                    id="generate-script-instructions-error"
                    errors={instructionsError ? [{ message: t("instructionsTooLong") }] : undefined}
                  />
                </Field>
              </FieldGroup>

              {isSubmitting ? (
                <p
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  <LoaderCircleIcon
                    aria-hidden="true"
                    className="size-4 motion-safe:animate-spin"
                  />
                  {t("generatingScript")}
                </p>
              ) : null}

              <DialogFooter>
                <Button
                  className="min-h-11"
                  disabled={isSubmitting}
                  onClick={onClose}
                  type="button"
                  variant="outline"
                >
                  {t("cancel")}
                </Button>
                <Button className="min-h-11" disabled={isSubmitting} type="submit">
                  {isSubmitting ? t("generatingScript") : t("submitGenerateScript")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}
