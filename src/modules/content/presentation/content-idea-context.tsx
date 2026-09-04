"use client";

import { ArrowLeftIcon, ArrowRightIcon, SparklesIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useRouter } from "@/i18n/navigation";
import type { IdeasDnaSummary } from "@/modules/ideas/presentation/ideas-types";
import {
  ContentAttemptHistory,
  ContentGenerationActionNotice,
  ContentGenerationDialog,
  type ContentGenerationFormValues,
  type ContentGenerationNotice,
} from "@/modules/ideas/presentation/content-generation-panel";
import type { ContentByIdeaDto } from "../application/content-read-service";
import {
  generateContentScriptAction,
  retryContentGenerationAttemptAction,
} from "../application/content-actions";

type ContentIdeaContextProps = Readonly<{
  workspaceId: string;
  dna: IdeasDnaSummary;
  sourceIdea: ContentByIdeaDto["sourceIdea"];
  history: ContentByIdeaDto["history"];
}>;

function errorNotice(
  code: string,
  rateLimitSource?: "workspace" | "provider",
): ContentGenerationNotice | null {
  return code ? { code, ...(rateLimitSource ? { rateLimitSource } : {}) } : null;
}

export function ContentIdeaContext({
  workspaceId,
  dna,
  sourceIdea,
  history,
}: ContentIdeaContextProps) {
  const t = useTranslations("Content");
  const locale = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState(false);
  const [notice, setNotice] = useState<ContentGenerationNotice | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [activeRetryAttemptId, setActiveRetryAttemptId] = useState<string | null>(null);
  const canGenerate = sourceIdea.status === "ACCEPTED" && dna.currentVersion !== null;

  async function generate(values: ContentGenerationFormValues): Promise<void> {
    if (!dna.currentVersion) {
      return;
    }

    setBusyAction("generate");
    setNotice(null);

    try {
      const result = await generateContentScriptAction({
        workspaceId,
        sourceIdeaId: sourceIdea.id,
        baseContentDnaVersionId: dna.currentVersion.id,
        requestedLanguage: values.requestedLanguage,
        format: values.format,
        instructions: values.instructions,
        idempotencyKey: crypto.randomUUID(),
      });

      if (result.ok) {
        router.push(`/content/${result.contentId}`);
        return;
      }

      setNotice(errorNotice(result.code, result.rateLimitSource));
    } finally {
      setBusyAction(null);
    }
  }

  async function retry(attemptId: string): Promise<void> {
    setBusyAction("retry");
    setActiveRetryAttemptId(attemptId);
    setNotice(null);

    try {
      const result = await retryContentGenerationAttemptAction({ workspaceId, attemptId });

      if (result.ok) {
        router.push(`/content/${result.contentId}`);
        return;
      }

      setNotice(errorNotice(result.code, result.rateLimitSource));
      router.refresh();
    } finally {
      setBusyAction(null);
      setActiveRetryAttemptId(null);
    }
  }

  const BackIcon = locale === "fa" ? ArrowRightIcon : ArrowLeftIcon;

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          href="/content"
        >
          <BackIcon aria-hidden="true" />
          {t("backToContent")}
        </Link>
        {canGenerate ? (
          <Button
            className="min-h-11"
            disabled={busyAction !== null}
            onClick={() => {
              setNotice(null);
              setSelected(true);
            }}
            type="button"
          >
            <SparklesIcon data-icon="inline-start" />
            {t("generateAnother")}
          </Button>
        ) : null}
      </div>

      <Card className="mt-6 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl" dir="auto">
            {sourceIdea.title}
          </CardTitle>
          <CardDescription>{t("sourceIdeaContext")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="leading-7 text-muted-foreground" dir="auto">
            {sourceIdea.description}
          </p>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ideaLanguage")}
              </dt>
              <dd className="mt-1 font-medium">
                {sourceIdea.language === "fa" ? t("persian") : t("english")}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("ideaStatus")}
              </dt>
              <dd className="mt-1 font-medium">{t(`ideaStatus${sourceIdea.status}`)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {notice ? (
        <ContentGenerationActionNotice
          notice={notice}
          onReload={() => {
            setNotice(null);
            router.refresh();
          }}
        />
      ) : null}

      <ContentAttemptHistory
        activeRetryAttemptId={activeRetryAttemptId}
        history={history}
        isBusy={busyAction !== null}
        onRetry={(attemptId) => void retry(attemptId)}
      />

      <ContentGenerationDialog
        dna={dna}
        idea={selected ? sourceIdea : null}
        isSubmitting={busyAction === "generate"}
        notice={notice}
        onClose={() => {
          if (!busyAction) {
            setSelected(false);
            setNotice(null);
          }
        }}
        onReload={() => {
          setSelected(false);
          setNotice(null);
          router.refresh();
        }}
        onSubmit={(values) => void generate(values)}
      />
    </>
  );
}
