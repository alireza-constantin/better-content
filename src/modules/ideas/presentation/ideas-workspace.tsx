"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  Clock3Icon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SparklesIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type RefObject } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RateLimitSource } from "@/lib/errors/app-error";
import { Link, useRouter } from "@/i18n/navigation";
import {
  generateContentScriptAction,
  retryContentGenerationAttemptAction,
} from "@/modules/content/application/content-actions";
import type {
  IdeaGenerationBatchDetailDto,
  IdeaGenerationBatchHistoryDto,
  IdeaGenerationBatchHistoryResult,
} from "@/modules/ideas/application";
import type { IdeaDto } from "@/modules/ideas/application";

import {
  generateIdeasAction,
  retryIdeaGenerationAction,
  updateIdeaDecisionAction,
} from "../application/ideas-actions";
import {
  ContentAttemptHistory,
  ContentGenerationActionNotice,
  ContentGenerationDialog,
  type ContentGenerationFormValues,
  type ContentGenerationNotice,
} from "./content-generation-panel";
import type { IdeasContentGenerationHistory, IdeasDnaSummary, IdeasLanguage } from "./ideas-types";

type IdeasWorkspaceProps = Readonly<{
  workspaceId: string;
  dna: IdeasDnaSummary;
  contentGenerationHistory?: IdeasContentGenerationHistory;
  initialHistory: IdeaGenerationBatchHistoryResult;
  initialDetail: IdeaGenerationBatchDetailDto | null;
}>;

type ActiveOperation = "generate" | "retry" | null;
type ActiveContentOperation =
  | Readonly<{ kind: "generate"; ideaId: string }>
  | Readonly<{ kind: "retry"; ideaId: string; attemptId: string }>
  | null;
type Notice =
  | Readonly<{ kind: "success"; message: "generationSuccess" | "decisionSuccess" }>
  | Readonly<{ kind: "error"; code: string; rateLimitSource?: RateLimitSource }>;

type RejectionFormValues = { rejectionReason: string };

const rejectionFormSchema = z.object({
  rejectionReason: z.string().max(500),
});

function formatBatchDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function languageLabel(t: ReturnType<typeof useTranslations>, language: IdeasLanguage): string {
  return language === "fa" ? t("languagePersian") : t("languageEnglish");
}

function lifecycleLabel(
  t: ReturnType<typeof useTranslations>,
  status: IdeaGenerationBatchHistoryDto["status"],
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

function contentPresentation(language: IdeasLanguage): Readonly<{
  dir: "ltr" | "rtl";
  fontClassName: "font-content-english" | "font-content-persian";
}> {
  return language === "fa"
    ? { dir: "rtl", fontClassName: "font-content-persian" }
    : { dir: "ltr", fontClassName: "font-content-english" };
}

function DecisionStatus({ status }: Readonly<{ status: IdeaDto["status"] }>) {
  const t = useTranslations("Ideas");

  const label =
    status === "NEW"
      ? t("decisionNew")
      : status === "SAVED"
        ? t("decisionSaved")
        : status === "ACCEPTED"
          ? t("decisionAccepted")
          : t("decisionRejected");

  return (
    <Badge
      variant={status === "REJECTED" ? "destructive" : status === "NEW" ? "outline" : "secondary"}
    >
      {label}
    </Badge>
  );
}

function LifecycleBadge({ status }: Readonly<{ status: IdeaGenerationBatchHistoryDto["status"] }>) {
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

function failureDescription(
  t: ReturnType<typeof useTranslations>,
  errorCategory: IdeaGenerationBatchDetailDto["errorCategory"],
  rateLimitSource: IdeaGenerationBatchDetailDto["rateLimitSource"],
): string {
  switch (errorCategory) {
    case "RATE_LIMITED":
      return rateLimitSource === "provider"
        ? t("failureProviderRateLimited")
        : t("failureRateLimited");
    case "INVALID_OUTPUT":
      return t("failureInvalidOutput");
    case "TIMEOUT":
      return t("failureTimeout");
    case "PROVIDER_UNAVAILABLE":
      return t("failureProviderUnavailable");
    case "INTERRUPTED":
      return t("failureInterrupted");
    default:
      return t("failureUnknown");
  }
}

function actionErrorCopy(
  t: ReturnType<typeof useTranslations>,
  code: string,
  rateLimitSource?: RateLimitSource,
): Readonly<{ title: string; description: string }> {
  switch (code) {
    case "CONFLICT":
      return { title: t("conflictTitle"), description: t("conflictDescription") };
    case "RATE_LIMITED":
      return rateLimitSource === "provider"
        ? {
            title: t("providerRateLimitedTitle"),
            description: t("providerRateLimitedDescription"),
          }
        : { title: t("rateLimitedTitle"), description: t("rateLimitedDescription") };
    case "PROVIDER_ERROR":
      return { title: t("providerFailureTitle"), description: t("providerFailureDescription") };
    case "AI_OUTPUT_INVALID":
      return { title: t("invalidOutputTitle"), description: t("invalidOutputDescription") };
    case "VALIDATION_ERROR":
      return { title: t("validationTitle"), description: t("validationDescription") };
    default:
      return { title: t("genericErrorTitle"), description: t("genericErrorDescription") };
  }
}

function ActionNotice({
  notice,
  onRefresh,
}: Readonly<{ notice: Notice | null; onRefresh: () => void }>) {
  const t = useTranslations("Ideas");

  if (!notice) {
    return null;
  }

  if (notice.kind === "success") {
    return (
      <p
        className="rounded-lg border border-emerald-800/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-300/20 dark:bg-emerald-950/30 dark:text-emerald-100"
        role="status"
        aria-live="polite"
      >
        <CheckCircle2Icon aria-hidden="true" className="me-2 inline-block size-4 align-[-0.2em]" />
        {notice.message === "generationSuccess" ? t("generationSuccess") : t("decisionSuccess")}
      </p>
    );
  }

  const copy = actionErrorCopy(t, notice.code, notice.rateLimitSource);

  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        <p>{copy.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {notice.code === "CONFLICT" ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-md border border-current px-3 py-2 text-sm font-medium underline underline-offset-4 transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              href="/content-dna"
            >
              {t("reviewContentDna")}
            </Link>
          ) : null}
          <Button
            className="min-h-11"
            onClick={onRefresh}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCwIcon data-icon="inline-start" />
            {t("refreshIdeas")}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function GenerationPanel({
  dna,
  isBusy,
  activeOperation,
  requestedLanguage,
  onLanguageChange,
  onGenerate,
  generationButtonRef,
}: Readonly<{
  dna: IdeasDnaSummary;
  isBusy: boolean;
  activeOperation: ActiveOperation;
  requestedLanguage: IdeasLanguage;
  onLanguageChange: (language: IdeasLanguage) => void;
  onGenerate: () => void;
  generationButtonRef: RefObject<HTMLButtonElement | null>;
}>) {
  const t = useTranslations("Ideas");
  const locale = useLocale();
  const currentVersion = dna.currentVersion;

  if (dna.status !== "AI_READY" || !currentVersion) {
    const isNotCreated = dna.status === "NOT_CREATED";

    return (
      <Card className="overflow-hidden border-dashed shadow-none">
        <CardHeader className="gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-foreground">
            {isNotCreated ? (
              <SparklesIcon aria-hidden="true" />
            ) : (
              <CircleDashedIcon aria-hidden="true" />
            )}
          </div>
          <h2 className="text-xl font-semibold leading-none tracking-tight">
            {isNotCreated ? t("noDnaTitle") : t("incompleteDnaTitle")}
          </h2>
          <CardDescription className="max-w-xl leading-6">
            {isNotCreated ? t("noDnaDescription") : t("incompleteDnaDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            href="/content-dna"
          >
            {t("openContentDna")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden border-foreground/15 bg-foreground text-background shadow-sm">
      <div className="absolute inset-y-0 start-0 w-1 bg-amber-300" />
      <CardHeader className="gap-4 ps-7 sm:ps-9">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-background/65">{t("generationEyebrow")}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-background sm:text-3xl">
              {t("generationTitle")}
            </h2>
          </div>
          <Badge
            className="border-background/20 bg-background/10 text-background"
            variant="outline"
          >
            {t("version", { version: currentVersion.versionNumber })}
          </Badge>
        </div>
        <CardDescription className="max-w-2xl leading-6 text-background/70">
          {t("generationDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 ps-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:ps-9">
        <div className="grid gap-2">
          <Label className="text-background" htmlFor="ideas-language">
            {t("languageLabel")}
          </Label>
          <Select
            disabled={isBusy}
            dir={locale === "fa" ? "rtl" : "ltr"}
            value={requestedLanguage}
            onValueChange={(value) => onLanguageChange(value as IdeasLanguage)}
          >
            <SelectTrigger
              aria-describedby="ideas-language-help"
              className="h-11 w-full border-background/25 bg-background/10 text-background hover:bg-background/15 sm:max-w-xs"
              id="ideas-language"
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
          <p className="text-sm text-background/60" id="ideas-language-help">
            {t("languageHelp")}
          </p>
        </div>
        <div className="grid gap-3 sm:justify-items-end">
          <p className="text-sm text-background/65">{t("fixedCount")}</p>
          <Button
            className="min-h-11 w-full bg-amber-300 text-amber-950 hover:bg-amber-200 sm:w-auto"
            disabled={isBusy}
            ref={generationButtonRef}
            onClick={onGenerate}
            type="button"
          >
            <WandSparklesIcon data-icon="inline-start" />
            {activeOperation === "generate" ? t("generating") : t("generate")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryList({
  batches,
  selectedBatchId,
}: Readonly<{
  batches: readonly IdeaGenerationBatchHistoryDto[];
  selectedBatchId: string | null;
}>) {
  const t = useTranslations("Ideas");
  const locale = useLocale();

  return (
    <aside className="min-w-0 lg:w-72 lg:shrink-0" aria-labelledby="ideas-history-title">
      <div className="flex items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            {t("historyEyebrow")}
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight" id="ideas-history-title">
            {t("historyTitle")}
          </h2>
        </div>
      </div>

      {batches.length === 0 ? (
        <div className="pt-5">
          <p className="text-sm font-medium text-foreground">{t("historyEmptyTitle")}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("historyEmptyDescription")}
          </p>
        </div>
      ) : (
        <ol className="mt-4 grid gap-2">
          {batches.map((batch) => {
            const isSelected = batch.id === selectedBatchId;

            return (
              <li key={batch.id}>
                <Link
                  aria-current={isSelected ? "page" : undefined}
                  className={`group block rounded-lg border px-4 py-3 transition-[background-color,border-color,box-shadow] hover:border-foreground/30 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${isSelected ? "border-foreground/30 bg-muted/60 shadow-sm" : "bg-card"}`}
                  href={`/ideas?batchId=${batch.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {t("batchLabel", { number: batch.contentDnaVersionNumber })}
                    </span>
                    <LifecycleBadge status={batch.status} />
                  </div>
                  <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                    <time dateTime={batch.createdAt.toISOString()} suppressHydrationWarning>
                      {formatBatchDate(batch.createdAt, locale)}
                    </time>
                    <span className="flex flex-wrap gap-x-2 gap-y-1">
                      <span>{languageLabel(t, batch.requestedLanguage)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {t("ideaCount", { count: batch.ideaCount })}
                      </span>
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

function IdeaCard({
  activeRetryAttemptId,
  idea,
  isBusy,
  contentGenerationHistory,
  onDecision,
  onGenerateScript,
  onReject,
  onRetryContentGeneration,
}: Readonly<{
  activeRetryAttemptId: string | null;
  idea: IdeaDto;
  isBusy: boolean;
  contentGenerationHistory: IdeasContentGenerationHistory;
  onDecision: (idea: IdeaDto, nextState: "ACCEPTED" | "SAVED") => void;
  onGenerateScript: (idea: IdeaDto, trigger: HTMLButtonElement) => void;
  onReject: (idea: IdeaDto, trigger: HTMLButtonElement) => void;
  onRetryContentGeneration: (ideaId: string, attemptId: string) => void;
}>) {
  const t = useTranslations("Ideas");
  const locale = useLocale();
  const uiLocale = locale === "fa" ? "fa" : "en";
  const uiDirection = uiLocale === "fa" ? "rtl" : "ltr";
  const content = contentPresentation(idea.language);
  const isPending = isBusy;
  const isAccepted = idea.status === "ACCEPTED";

  return (
    <li>
      <article className="flex h-full flex-col rounded-xl border bg-card p-5 shadow-sm transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-md sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {String(idea.position).padStart(2, "0")}
          </span>
          <DecisionStatus status={idea.status} />
        </div>
        <h3
          className={`mt-5 break-words text-balance text-lg font-semibold tracking-tight ${content.fontClassName}`}
          dir={content.dir}
          lang={idea.language}
        >
          {idea.title}
        </h3>
        <p
          className={`mt-3 flex-1 break-words whitespace-pre-wrap text-sm leading-6 text-muted-foreground ${content.fontClassName}`}
          dir={content.dir}
          lang={idea.language}
        >
          {idea.description}
        </p>
        {idea.category ? (
          <p
            className="mt-5 flex flex-wrap items-baseline gap-x-1 text-xs font-medium text-foreground/70"
            dir={uiDirection}
          >
            <bdi className="font-sans text-muted-foreground" dir={uiDirection} lang={uiLocale}>
              {t("categoryLabel")}:
            </bdi>
            <bdi
              className={`min-w-0 break-words ${content.fontClassName}`}
              dir={content.dir}
              lang={idea.language}
            >
              {idea.category}
            </bdi>
          </p>
        ) : null}
        <div className="mt-5 border-t border-border pt-4">
          <div className="grid gap-4">
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">{t("decisionActionsLabel")}</legend>
              <Button
                aria-pressed={idea.status === "ACCEPTED"}
                className="min-h-11 flex-1 sm:flex-none"
                disabled={isPending || idea.status === "ACCEPTED"}
                onClick={() => onDecision(idea, "ACCEPTED")}
                size="sm"
                type="button"
                variant={idea.status === "ACCEPTED" ? "default" : "outline"}
              >
                {t("accept")}
              </Button>
              <Button
                aria-pressed={idea.status === "SAVED"}
                className="min-h-11 flex-1 sm:flex-none"
                disabled={isPending || idea.status === "SAVED"}
                onClick={() => onDecision(idea, "SAVED")}
                size="sm"
                type="button"
                variant={idea.status === "SAVED" ? "secondary" : "outline"}
              >
                {t("saveForLater")}
              </Button>
              <Button
                aria-pressed={idea.status === "REJECTED"}
                className="min-h-11 flex-1 sm:flex-none"
                disabled={isPending}
                onClick={(event) => onReject(idea, event.currentTarget)}
                size="sm"
                type="button"
                variant={idea.status === "REJECTED" ? "destructive" : "outline"}
              >
                {t("reject")}
              </Button>
            </fieldset>

            {isAccepted ? (
              <Button
                className="min-h-11 w-full sm:w-fit"
                disabled={isPending}
                onClick={(event) => onGenerateScript(idea, event.currentTarget)}
                type="button"
              >
                <WandSparklesIcon data-icon="inline-start" />
                {t("generateScript")}
              </Button>
            ) : null}

            {isAccepted ? (
              <ContentAttemptHistory
                activeRetryAttemptId={activeRetryAttemptId}
                history={contentGenerationHistory[idea.id]}
                isBusy={isPending}
                onRetry={(attemptId) => onRetryContentGeneration(idea.id, attemptId)}
              />
            ) : null}
          </div>
        </div>
      </article>
    </li>
  );
}

function RejectReasonDialog({
  idea,
  isSubmitting,
  onClose,
  onSubmit,
}: Readonly<{
  idea: IdeaDto | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}>) {
  const t = useTranslations("Ideas");
  const content = idea ? contentPresentation(idea.language) : null;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const form = useForm<RejectionFormValues>({
    resolver: zodResolver(rejectionFormSchema),
    defaultValues: { rejectionReason: "" },
  });
  const reason = useWatch({ control: form.control, name: "rejectionReason" }) ?? "";

  useEffect(() => {
    if (!idea) {
      return;
    }

    form.reset({ rejectionReason: idea.rejectionReason ?? "" });
    const focusTimer = window.setTimeout(() => textareaRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [form, idea]);

  if (!idea) {
    return null;
  }

  const rejectionField = form.register("rejectionReason");
  const errorId = "idea-rejection-reason-error";

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
          <DialogContent>
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("rejectEyebrow")}</p>
                <DialogTitle className="mt-2" id="idea-rejection-title">
                  {t("rejectTitle")}
                </DialogTitle>
              </div>
              <DialogClose
                aria-label={t("cancel")}
                className="inline-flex size-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                disabled={isSubmitting}
              >
                <XIcon aria-hidden="true" className="size-4" />
              </DialogClose>
            </div>
            <DialogDescription className="mt-4" id="idea-rejection-description">
              {t("rejectDescription")}
            </DialogDescription>
            <p
              className={`mt-4 rounded-lg bg-muted px-3 py-2 text-sm font-medium ${content?.fontClassName ?? ""}`}
              dir={content?.dir}
              lang={idea.language}
            >
              {idea.title}
            </p>
            <form
              aria-busy={isSubmitting}
              className="mt-6 grid gap-5"
              noValidate
              onSubmit={form.handleSubmit(({ rejectionReason }) => onSubmit(rejectionReason))}
            >
              <Field data-invalid={Boolean(form.formState.errors.rejectionReason)}>
                <FieldLabel htmlFor="idea-rejection-reason">{t("rejectReasonLabel")}</FieldLabel>
                <Textarea
                  aria-describedby={`idea-rejection-reason-help${form.formState.errors.rejectionReason ? ` ${errorId}` : ""}`}
                  aria-invalid={Boolean(form.formState.errors.rejectionReason)}
                  autoComplete="off"
                  className="min-h-32 resize-y"
                  disabled={isSubmitting}
                  dir="auto"
                  id="idea-rejection-reason"
                  maxLength={500}
                  placeholder={t("rejectReasonPlaceholder")}
                  {...rejectionField}
                  ref={(element) => {
                    rejectionField.ref(element);
                    textareaRef.current = element;
                  }}
                />
                <FieldDescription id="idea-rejection-reason-help">
                  {t("rejectReasonHelp")}
                </FieldDescription>
                <FieldError
                  id={errorId}
                  errors={
                    form.formState.errors.rejectionReason
                      ? [{ message: t("reasonTooLong") }]
                      : undefined
                  }
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                  {t("characterCount", { count: reason.length })}
                </p>
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
                    {isSubmitting ? t("rejecting") : t("confirmReject")}
                  </Button>
                </DialogFooter>
              </div>
            </form>
          </DialogContent>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}

function DetailPanel({
  activeContentOperation,
  contentGenerationHistory,
  detail,
  isBusy,
  activeOperation,
  onGenerateScript,
  onRetry,
  onRetryContentGeneration,
  onDecision,
  onReject,
}: Readonly<{
  activeContentOperation: ActiveContentOperation;
  contentGenerationHistory: IdeasContentGenerationHistory;
  detail: IdeaGenerationBatchDetailDto | null;
  isBusy: boolean;
  activeOperation: ActiveOperation;
  onGenerateScript: (idea: IdeaDto, trigger: HTMLButtonElement) => void;
  onRetry: (batchId: string) => void;
  onRetryContentGeneration: (ideaId: string, attemptId: string) => void;
  onDecision: (idea: IdeaDto, nextState: "ACCEPTED" | "SAVED") => void;
  onReject: (idea: IdeaDto, trigger: HTMLButtonElement) => void;
}>) {
  const t = useTranslations("Ideas");

  if (!detail) {
    return (
      <Card className="border-dashed shadow-none">
        <CardHeader>
          <h3 className="font-semibold leading-none tracking-tight">{t("detailEmptyTitle")}</h3>
          <CardDescription className="leading-6">{t("detailEmptyDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isActive = detail.status === "PENDING" || detail.status === "RUNNING";

  return (
    <section aria-labelledby="ideas-detail-title" className="min-w-0">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            {t("detailEyebrow")}
          </p>
          <h2
            className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
            id="ideas-detail-title"
          >
            {detail.status === "COMPLETED"
              ? t("detailTitle", { count: detail.ideas.length })
              : detail.status === "FAILED"
                ? t("failedTitle")
                : t("activeTitle")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("batchMeta", {
              version: detail.contentDnaVersionNumber,
              language: languageLabel(t, detail.requestedLanguage),
            })}
          </p>
        </div>
        <LifecycleBadge status={detail.status} />
      </div>

      {isActive ? (
        <Card
          className="mt-6 border-dashed bg-muted/30 shadow-none"
          role="status"
          aria-live="polite"
        >
          <CardContent className="flex items-start gap-4 p-6">
            <LoaderCircleIcon
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 motion-safe:animate-spin"
            />
            <div>
              <h3 className="font-semibold">{t("activeTitle")}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {detail.status === "PENDING" ? t("pendingDescription") : t("runningDescription")}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : detail.status === "FAILED" ? (
        <Alert className="mt-6" variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{t("failedTitle")}</AlertTitle>
          <AlertDescription>
            <p>{failureDescription(t, detail.errorCategory, detail.rateLimitSource)}</p>
            {detail.canRetry ? (
              <Button
                className="mt-4 min-h-11"
                disabled={isBusy}
                onClick={() => onRetry(detail.id)}
                type="button"
              >
                <RefreshCwIcon data-icon="inline-start" />
                {activeOperation === "retry" ? t("retrying") : t("retry")}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <p className="mt-6 text-sm leading-6 text-muted-foreground">
            {t("completedDescription")}
          </p>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2" aria-label={t("ideasListLabel")}>
            {detail.ideas.map((idea) => (
              <IdeaCard
                contentGenerationHistory={contentGenerationHistory}
                activeRetryAttemptId={
                  activeContentOperation?.kind === "retry" &&
                  activeContentOperation.ideaId === idea.id
                    ? activeContentOperation.attemptId
                    : null
                }
                isBusy={isBusy}
                idea={idea}
                key={idea.id}
                onDecision={onDecision}
                onGenerateScript={onGenerateScript}
                onReject={onReject}
                onRetryContentGeneration={onRetryContentGeneration}
              />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

export function IdeasWorkspace({
  workspaceId,
  dna,
  contentGenerationHistory = {},
  initialHistory,
  initialDetail,
}: IdeasWorkspaceProps) {
  const t = useTranslations("Ideas");
  const router = useRouter();
  const locale = useLocale();
  const [history, setHistory] = useState<readonly IdeaGenerationBatchHistoryDto[]>(
    initialHistory.batches,
  );
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(
    initialHistory.selectedBatchId,
  );
  const [detail, setDetail] = useState<IdeaGenerationBatchDetailDto | null>(initialDetail);
  const [requestedLanguage, setRequestedLanguage] = useState<IdeasLanguage>(() => {
    const currentVersion = dna.currentVersion;
    return currentVersion?.defaultContentLanguage ?? currentVersion?.contentLanguages[0] ?? "en";
  });
  const [activeOperation, setActiveOperation] = useState<ActiveOperation>(null);
  const [activeContentOperation, setActiveContentOperation] =
    useState<ActiveContentOperation>(null);
  const [pendingDecisionId, setPendingDecisionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [contentNotice, setContentNotice] = useState<ContentGenerationNotice | null>(null);
  const [generatingIdea, setGeneratingIdea] = useState<IdeaDto | null>(null);
  const [rejectingIdea, setRejectingIdea] = useState<IdeaDto | null>(null);
  const generationButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreGenerationFocus = useRef(false);
  const generateScriptTriggerRef = useRef<HTMLButtonElement | null>(null);
  const rejectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const serverDataSignature = `${initialHistory.selectedBatchId}|${initialHistory.batches.map((batch) => `${batch.id}:${batch.status}:${batch.ideaCount}`).join(",")}|${initialDetail?.id ?? "none"}:${initialDetail?.status ?? "none"}:${initialDetail?.ideas.length ?? 0}`;
  const lastServerDataSignature = useRef(serverDataSignature);

  useEffect(() => {
    if (serverDataSignature === lastServerDataSignature.current) {
      return;
    }

    lastServerDataSignature.current = serverDataSignature;
    setHistory(initialHistory.batches);
    setSelectedBatchId(initialHistory.selectedBatchId);
    setDetail(initialDetail);

    if (restoreGenerationFocus.current) {
      restoreGenerationFocus.current = false;
      const focusTimer = window.setTimeout(() => generationButtonRef.current?.focus(), 0);

      return () => window.clearTimeout(focusTimer);
    }
  }, [initialDetail, initialHistory.batches, initialHistory.selectedBatchId, serverDataSignature]);

  const isBusy = isPending || pendingDecisionId !== null || activeContentOperation !== null;
  const currentVersion = dna.currentVersion;
  const activeRequestedLanguage = currentVersion?.contentLanguages.includes(requestedLanguage)
    ? requestedLanguage
    : currentVersion?.defaultContentLanguage &&
        currentVersion.contentLanguages.includes(currentVersion.defaultContentLanguage)
      ? currentVersion.defaultContentLanguage
      : (currentVersion?.contentLanguages[0] ?? "en");

  function refreshIdeas() {
    router.refresh();
  }

  function handleGenerate() {
    if (dna.status !== "AI_READY" || !dna.currentVersion) {
      return;
    }

    setNotice(null);
    setActiveOperation("generate");
    restoreGenerationFocus.current = true;
    startTransition(async () => {
      try {
        const result = await generateIdeasAction({
          workspaceId,
          baseContentDnaVersionId: dna.currentVersion?.id,
          requestedLanguage: activeRequestedLanguage,
          idempotencyKey: crypto.randomUUID(),
        });

        if (!result.ok) {
          setNotice({
            kind: "error",
            code: result.code,
            ...(result.rateLimitSource ? { rateLimitSource: result.rateLimitSource } : {}),
          });
          const isWorkspaceRateLimit =
            result.code === "RATE_LIMITED" && result.rateLimitSource === "workspace";
          if (result.code !== "CONFLICT" && !isWorkspaceRateLimit) {
            router.refresh();
          }
          return;
        }

        setNotice({ kind: "success", message: "generationSuccess" });
        router.refresh();
      } catch {
        setNotice({ kind: "error", code: "INTERNAL_ERROR" });
        router.refresh();
      } finally {
        setActiveOperation(null);
      }
    });
  }

  function handleRetry(batchId: string) {
    setNotice(null);
    setActiveOperation("retry");
    startTransition(async () => {
      try {
        const result = await retryIdeaGenerationAction({ workspaceId, batchId });

        if (!result.ok) {
          setNotice({
            kind: "error",
            code: result.code,
            ...(result.rateLimitSource ? { rateLimitSource: result.rateLimitSource } : {}),
          });
          router.refresh();
          return;
        }

        setNotice({ kind: "success", message: "generationSuccess" });
        router.refresh();
      } catch {
        setNotice({ kind: "error", code: "INTERNAL_ERROR" });
        router.refresh();
      } finally {
        setActiveOperation(null);
      }
    });
  }

  function openContentGenerationDialog(idea: IdeaDto, trigger: HTMLButtonElement) {
    if (idea.status !== "ACCEPTED" || dna.status !== "AI_READY" || !currentVersion) {
      return;
    }

    generateScriptTriggerRef.current = trigger;
    setContentNotice(null);
    setGeneratingIdea(idea);
  }

  function closeContentGenerationDialog() {
    setGeneratingIdea(null);
  }

  function reloadCurrentContentState() {
    setGeneratingIdea(null);
    setContentNotice(null);
    router.refresh();
  }

  function shouldRefreshContentHistory(
    result: Readonly<{ code: string; rateLimitSource?: RateLimitSource }>,
  ): boolean {
    return !(
      result.code === "CONFLICT" ||
      result.code === "VALIDATION_ERROR" ||
      (result.code === "RATE_LIMITED" && result.rateLimitSource === "workspace")
    );
  }

  function handleContentGenerationSubmit(values: ContentGenerationFormValues) {
    if (!generatingIdea || !currentVersion) {
      return;
    }

    const idea = generatingIdea;
    const instructions = values.instructions.trim();
    setContentNotice(null);
    setActiveContentOperation({ kind: "generate", ideaId: idea.id });
    startTransition(async () => {
      try {
        const result = await generateContentScriptAction({
          workspaceId,
          sourceIdeaId: idea.id,
          baseContentDnaVersionId: currentVersion.id,
          requestedLanguage: values.requestedLanguage,
          format: values.format,
          ...(instructions ? { instructions } : {}),
          idempotencyKey: crypto.randomUUID(),
        });

        if (!result.ok) {
          setContentNotice({
            code: result.code,
            ...(result.rateLimitSource ? { rateLimitSource: result.rateLimitSource } : {}),
          });
          if (shouldRefreshContentHistory(result)) {
            router.refresh();
          }
          return;
        }

        if (!result.contentId) {
          setContentNotice({ code: "INTERNAL_ERROR" });
          router.refresh();
          return;
        }

        router.push(`/content/${result.contentId}`);
      } catch {
        setContentNotice({ code: "INTERNAL_ERROR" });
        router.refresh();
      } finally {
        setActiveContentOperation(null);
      }
    });
  }

  function handleContentGenerationRetry(ideaId: string, attemptId: string) {
    setContentNotice(null);
    setActiveContentOperation({ kind: "retry", ideaId, attemptId });
    startTransition(async () => {
      try {
        const result = await retryContentGenerationAttemptAction({ workspaceId, attemptId });

        if (!result.ok) {
          setContentNotice({
            code: result.code,
            ...(result.rateLimitSource ? { rateLimitSource: result.rateLimitSource } : {}),
          });
          router.refresh();
          return;
        }

        if (!result.contentId) {
          setContentNotice({ code: "INTERNAL_ERROR" });
          router.refresh();
          return;
        }

        router.push(`/content/${result.contentId}`);
      } catch {
        setContentNotice({ code: "INTERNAL_ERROR" });
        router.refresh();
      } finally {
        setActiveContentOperation(null);
      }
    });
  }

  function handleDecision(idea: IdeaDto, nextState: "ACCEPTED" | "SAVED") {
    setNotice(null);
    setPendingDecisionId(idea.id);
    startTransition(async () => {
      try {
        const result = await updateIdeaDecisionAction({
          workspaceId,
          ideaId: idea.id,
          nextState,
        });

        if (!result.ok) {
          setNotice({ kind: "error", code: result.code });
          return;
        }

        setDetail((currentDetail) =>
          currentDetail
            ? {
                ...currentDetail,
                ideas: currentDetail.ideas.map((currentIdea) =>
                  currentIdea.id === result.idea.id ? result.idea : currentIdea,
                ),
              }
            : currentDetail,
        );
        setNotice({ kind: "success", message: "decisionSuccess" });
      } catch {
        setNotice({ kind: "error", code: "INTERNAL_ERROR" });
      } finally {
        setPendingDecisionId(null);
      }
    });
  }

  function openRejectDialog(idea: IdeaDto, trigger: HTMLButtonElement) {
    rejectTriggerRef.current = trigger;
    setRejectingIdea(idea);
  }

  function closeRejectDialog() {
    setRejectingIdea(null);
  }

  useEffect(() => {
    if (rejectingIdea || isPending || pendingDecisionId) {
      return;
    }

    const trigger = rejectTriggerRef.current;

    if (!trigger) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      if (!trigger.disabled) {
        trigger.focus();
        rejectTriggerRef.current = null;
      }
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [isPending, pendingDecisionId, rejectingIdea]);

  useEffect(() => {
    if (generatingIdea || activeContentOperation) {
      return;
    }

    const trigger = generateScriptTriggerRef.current;

    if (!trigger) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      if (!trigger.disabled) {
        trigger.focus();
        generateScriptTriggerRef.current = null;
      }
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [activeContentOperation, generatingIdea]);

  function submitRejectionReason(reason: string) {
    if (!rejectingIdea) {
      return;
    }

    setNotice(null);
    setPendingDecisionId(rejectingIdea.id);
    startTransition(async () => {
      try {
        const result = await updateIdeaDecisionAction({
          workspaceId,
          ideaId: rejectingIdea.id,
          nextState: "REJECTED",
          rejectionReason: reason.trim() || null,
        });

        if (!result.ok) {
          setNotice({ kind: "error", code: result.code });
          return;
        }

        setDetail((currentDetail) =>
          currentDetail
            ? {
                ...currentDetail,
                ideas: currentDetail.ideas.map((currentIdea) =>
                  currentIdea.id === result.idea.id ? result.idea : currentIdea,
                ),
              }
            : currentDetail,
        );
        setNotice({ kind: "success", message: "decisionSuccess" });
        closeRejectDialog();
      } catch {
        setNotice({ kind: "error", code: "INTERNAL_ERROR" });
      } finally {
        setPendingDecisionId(null);
      }
    });
  }

  return (
    <div className="grid gap-8" dir={locale === "fa" ? "rtl" : "ltr"}>
      <header className="max-w-3xl">
        <p className="text-sm font-medium tracking-wide text-muted-foreground">{t("eyebrow")}</p>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-5 max-w-2xl text-pretty leading-7 text-muted-foreground">
          {t("description")}
        </p>
      </header>

      <GenerationPanel
        activeOperation={activeOperation}
        dna={dna}
        generationButtonRef={generationButtonRef}
        isBusy={isBusy}
        onGenerate={handleGenerate}
        onLanguageChange={setRequestedLanguage}
        requestedLanguage={activeRequestedLanguage}
      />

      <ActionNotice notice={notice} onRefresh={refreshIdeas} />
      <ContentGenerationActionNotice
        notice={generatingIdea ? null : contentNotice}
        onReload={reloadCurrentContentState}
      />

      {isPending && activeOperation ? (
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <LoaderCircleIcon aria-hidden="true" className="size-4 motion-safe:animate-spin" />
          {activeOperation === "retry" ? t("retrying") : t("generating")}
        </p>
      ) : null}

      <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
        <HistoryList batches={history} selectedBatchId={selectedBatchId} />
        <div className="min-w-0 flex-1">
          <DetailPanel
            activeContentOperation={activeContentOperation}
            activeOperation={activeOperation}
            contentGenerationHistory={contentGenerationHistory}
            detail={detail}
            isBusy={isBusy}
            onDecision={handleDecision}
            onGenerateScript={openContentGenerationDialog}
            onReject={openRejectDialog}
            onRetry={handleRetry}
            onRetryContentGeneration={handleContentGenerationRetry}
          />
        </div>
      </div>

      <RejectReasonDialog
        idea={rejectingIdea}
        isSubmitting={pendingDecisionId === rejectingIdea?.id}
        onClose={closeRejectDialog}
        onSubmit={submitRejectionReason}
      />
      <ContentGenerationDialog
        dna={dna}
        idea={generatingIdea}
        isSubmitting={activeContentOperation?.kind === "generate"}
        notice={contentNotice}
        onClose={closeContentGenerationDialog}
        onReload={reloadCurrentContentState}
        onSubmit={handleContentGenerationSubmit}
      />
    </div>
  );
}
