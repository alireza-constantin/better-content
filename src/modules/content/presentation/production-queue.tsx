"use client";

import {
  AlertCircleIcon,
  GripVerticalIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ContentGenerationDialog,
  ContentGenerationActionNotice,
  type ContentGenerationFormValues,
  type ContentGenerationNotice,
} from "@/modules/ideas/presentation/content-generation-panel";
import type { IdeasDnaSummary } from "@/modules/ideas/presentation/ideas-types";

import {
  generateContentScriptAction,
  reorderProductionQueueAction,
  retryContentGenerationAttemptAction,
} from "../application/content-actions";
import { updateIdeaDecisionAction } from "@/modules/ideas/application/ideas-actions";
import {
  RejectReasonDialog,
  type RejectReasonIdea,
} from "@/modules/ideas/presentation/ideas-workspace";
import type { ProductionQueueItemDto } from "../application/production-queue-service";

type ProductionQueueProps = Readonly<{
  workspaceId: string;
  dna: IdeasDnaSummary;
  initialQueue: readonly ProductionQueueItemDto[];
}>;

function languageLabel(
  t: ReturnType<typeof useTranslations>,
  language: ProductionQueueItemDto["language"],
): string {
  return language === "fa" ? t("persian") : t("english");
}

function attemptLabel(
  t: ReturnType<typeof useTranslations>,
  attempt: ProductionQueueItemDto["lastAttempt"],
): string | null {
  if (!attempt) {
    return null;
  }

  switch (attempt.status) {
    case "PENDING":
      return t("queueAttemptPending");
    case "RUNNING":
      return t("queueAttemptRunning");
    case "FAILED":
      return t("queueAttemptFailed");
    case "COMPLETED":
      return t("queueAttemptCompleted");
  }
}

function errorNotice(
  code: string,
  rateLimitSource?: "workspace" | "provider",
): ContentGenerationNotice | null {
  return code ? { code, ...(rateLimitSource ? { rateLimitSource } : {}) } : null;
}

export function ProductionQueue({ workspaceId, dna, initialQueue }: ProductionQueueProps) {
  const t = useTranslations("Content");
  const router = useRouter();
  const [items, setItems] = useState(initialQueue);
  const [selectedIdea, setSelectedIdea] = useState<ProductionQueueItemDto | null>(null);
  const [rejectingIdea, setRejectingIdea] = useState<RejectReasonIdea | null>(null);
  const [notice, setNotice] = useState<ContentGenerationNotice | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const draggedIdeaIdRef = useRef<string | null>(null);

  async function generate(values: ContentGenerationFormValues): Promise<void> {
    if (!selectedIdea || !dna.currentVersion) {
      return;
    }

    setBusyAction(`generate:${selectedIdea.id}`);
    setNotice(null);

    try {
      const result = await generateContentScriptAction({
        workspaceId,
        sourceIdeaId: selectedIdea.id,
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

  async function retry(attemptId: string, ideaId: string): Promise<void> {
    setBusyAction(`retry:${ideaId}`);
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
    }
  }

  async function persistOrder(nextItems: readonly ProductionQueueItemDto[]): Promise<void> {
    setBusyAction("reorder");
    setNotice(null);

    try {
      const result = await reorderProductionQueueAction({
        workspaceId,
        orderedIdeaIds: nextItems.map((item) => item.id),
      });

      if (result.ok) {
        router.refresh();
        return;
      }

      setNotice(errorNotice(result.code, result.rateLimitSource));
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  async function decide(
    ideaId: string,
    nextState: "SAVED" | "REJECTED",
    reason?: string,
  ): Promise<void> {
    setBusyAction(`decision:${ideaId}`);
    setNotice(null);

    try {
      const result = await updateIdeaDecisionAction({
        workspaceId,
        ideaId,
        nextState,
        ...(reason ? { rejectionReason: reason } : {}),
      });
      if (!result.ok) {
        setNotice(errorNotice(result.code, result.rateLimitSource));
        router.refresh();
        return;
      }
      setRejectingIdea(null);
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  function moveItem(ideaId: string, delta: -1 | 1): void {
    if (busyAction) {
      return;
    }

    const currentIndex = items.findIndex((item) => item.id === ideaId);
    const nextIndex = currentIndex + delta;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) {
      return;
    }

    const nextItems = [...items];
    [nextItems[currentIndex], nextItems[nextIndex]] = [
      nextItems[nextIndex],
      nextItems[currentIndex],
    ];
    setItems(nextItems);
    void persistOrder(nextItems);
  }

  function openGenerate(idea: ProductionQueueItemDto): void {
    setNotice(null);
    setSelectedIdea(idea);
  }

  return (
    <>
      <Card className="mt-8 overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-muted/20 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">
                <h2 className="flex items-center gap-2">
                  <SparklesIcon aria-hidden="true" className="size-5 text-amber-600" />
                  {t("productionQueueTitle")}
                </h2>
              </CardTitle>
              <CardDescription className="mt-1 max-w-2xl text-sm leading-6">
                {t("productionQueueDescription")}
              </CardDescription>
            </div>
            <Badge variant="outline">{t("queueCount", { count: items.length })}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {notice ? (
            <div className="px-6 pt-6">
              <ContentGenerationActionNotice
                notice={notice}
                onReload={() => {
                  setNotice(null);
                  setItems(initialQueue);
                  router.refresh();
                }}
              />
            </div>
          ) : null}

          {items.length === 0 ? (
            <div className="grid gap-2 px-6 py-10">
              <h3 className="font-semibold">{t("productionQueueEmptyTitle")}</h3>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                {t("productionQueueEmptyDescription")}
              </p>
            </div>
          ) : (
            <>
              <p className="sr-only" id="production-queue-reorder-help">
                {t("dragQueueItemHelp")}
              </p>
              <ol
                aria-describedby="production-queue-reorder-help"
                aria-label={t("productionQueueListLabel")}
                className="divide-y divide-border"
              >
                {items.map((item, index) => {
                  const attemptText = attemptLabel(t, item.lastAttempt);
                  const isBusy = busyAction !== null;

                  return (
                    <li
                      className="grid items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto_auto] sm:px-5 sm:py-3"
                      draggable={!isBusy}
                      key={item.id}
                      onDragEnd={() => {
                        draggedIdeaIdRef.current = null;
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragStart={() => {
                        draggedIdeaIdRef.current = item.id;
                      }}
                      onDrop={() => {
                        const sourceIdeaId = draggedIdeaIdRef.current;
                        if (sourceIdeaId && sourceIdeaId !== item.id) {
                          const from = items.findIndex((entry) => entry.id === sourceIdeaId);
                          const to = items.findIndex((entry) => entry.id === item.id);
                          if (from >= 0 && to >= 0) {
                            const nextItems = [...items];
                            const [moved] = nextItems.splice(from, 1);
                            nextItems.splice(to, 0, moved);
                            setItems(nextItems);
                            void persistOrder(nextItems);
                          }
                        }
                        draggedIdeaIdRef.current = null;
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-3 sm:contents">
                        <div
                          aria-label={t("dragQueueItem", { title: item.title })}
                          aria-describedby="production-queue-reorder-help"
                          aria-keyshortcuts="ArrowUp ArrowDown"
                          className="flex size-11 shrink-0 cursor-grab items-center justify-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                          onKeyDown={(event) => {
                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              moveItem(item.id, -1);
                            } else if (event.key === "ArrowDown") {
                              event.preventDefault();
                              moveItem(item.id, 1);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <GripVerticalIcon aria-hidden="true" />
                        </div>
                        <div className="min-w-0 sm:col-start-2 sm:col-end-3">
                          <div className="flex min-w-0 items-baseline gap-3">
                            <span className="w-7 shrink-0 text-xs font-medium tabular-nums text-muted-foreground/70">
                              {t("queueOrder", { position: String(index + 1).padStart(2, "0") })}
                            </span>
                            <h3
                              className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight"
                              dir="auto"
                              title={item.title}
                            >
                              {item.title}
                            </h3>
                          </div>
                          <p
                            className="mt-0.5 truncate ps-10 text-xs leading-5 text-muted-foreground"
                            dir="auto"
                            title={item.description}
                          >
                            {item.description}
                          </p>
                          {attemptText ? (
                            <p
                              className={`mt-1 flex items-center gap-1.5 ps-10 text-xs ${item.lastAttempt?.status === "FAILED" ? "text-destructive" : "text-muted-foreground"}`}
                              role={item.lastAttempt?.status === "FAILED" ? "alert" : "status"}
                            >
                              {item.lastAttempt?.status === "FAILED" ? (
                                <AlertCircleIcon aria-hidden="true" className="size-4" />
                              ) : (
                                <LoaderCircleIcon
                                  aria-hidden="true"
                                  className="size-4 motion-safe:animate-spin"
                                />
                              )}
                              {attemptText}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <Badge className="w-fit text-xs" variant="outline">
                        {languageLabel(t, item.language)}
                      </Badge>
                      <div className="flex flex-wrap items-center justify-end gap-1.5 sm:justify-start">
                        <Button
                          className="min-h-11 px-3 text-sm"
                          disabled={isBusy}
                          onClick={() => openGenerate(item)}
                          type="button"
                        >
                          <SparklesIcon data-icon="inline-start" />
                          {t("generate")}
                        </Button>
                        {item.lastAttempt?.status === "FAILED" ? (
                          <Button
                            className="min-h-11 px-3 text-sm"
                            disabled={isBusy}
                            onClick={() => void retry(item.lastAttempt!.id, item.id)}
                            type="button"
                            variant="outline"
                          >
                            <RefreshCwIcon data-icon="inline-start" />
                            {t("retryGeneration")}
                          </Button>
                        ) : null}
                        <Button
                          className="min-h-11 px-3 text-sm"
                          disabled={isBusy}
                          onClick={() => void decide(item.id, "SAVED")}
                          type="button"
                          variant="outline"
                        >
                          {t("saveIdea")}
                        </Button>
                        <Button
                          className="min-h-11 px-3 text-sm"
                          disabled={isBusy}
                          onClick={() =>
                            setRejectingIdea({
                              id: item.id,
                              title: item.title,
                              language: item.language,
                              rejectionReason: null,
                            })
                          }
                          type="button"
                          variant="outline"
                        >
                          {t("rejectIdea")}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </CardContent>
      </Card>
      <ContentGenerationDialog
        dna={dna}
        idea={selectedIdea}
        isSubmitting={busyAction?.startsWith("generate:") ?? false}
        notice={notice}
        onClose={() => {
          if (!busyAction) {
            setSelectedIdea(null);
            setNotice(null);
            router.refresh();
          }
        }}
        onReload={() => {
          setSelectedIdea(null);
          setNotice(null);
          setItems(initialQueue);
          router.refresh();
        }}
        onSubmit={(values) => void generate(values)}
      />
      <RejectReasonDialog
        idea={rejectingIdea}
        isSubmitting={busyAction?.startsWith("decision:") ?? false}
        onClose={() => {
          if (!busyAction) {
            setRejectingIdea(null);
          }
        }}
        onSubmit={(reason) => void decide(rejectingIdea?.id ?? "", "REJECTED", reason)}
      />
    </>
  );
}
