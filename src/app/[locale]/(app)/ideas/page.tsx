import { getTranslations } from "next-intl/server";

import { getServerSession } from "@/lib/auth/server";
import { getCurrentContentDna } from "@/modules/dna/application";
import { getIdeaGenerationBatch, getIdeaGenerationBatchHistory } from "@/modules/ideas/application";
import { IdeasWorkspace } from "@/modules/ideas/presentation/ideas-workspace";
import type { IdeasDnaSummary, IdeasLanguage } from "@/modules/ideas/presentation/ideas-types";
import { getOrCreateDefaultWorkspace } from "@/modules/workspace/application";

function toDnaSummary(current: Awaited<ReturnType<typeof getCurrentContentDna>>): IdeasDnaSummary {
  if (current.status === "NOT_CREATED" || !current.currentVersion) {
    return { status: "NOT_CREATED", currentVersion: null };
  }

  const language = current.currentVersion.payload.language;
  const contentLanguages = (language?.contentLanguages ?? []).filter(
    (value): value is IdeasLanguage => value === "en" || value === "fa",
  );
  const defaultContentLanguage =
    (language?.defaultContentLanguage === "en" || language?.defaultContentLanguage === "fa") &&
    contentLanguages.includes(language.defaultContentLanguage)
      ? language.defaultContentLanguage
      : null;

  return {
    status: current.status,
    currentVersion: {
      id: current.currentVersion.id,
      versionNumber: current.currentVersion.versionNumber,
      defaultContentLanguage,
      contentLanguages,
    },
  };
}

export default async function IdeasPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ batchId?: string | string[] }>;
}>) {
  const [session, search] = await Promise.all([getServerSession(), searchParams]);

  if (!session) {
    return null;
  }

  const workspace = await getOrCreateDefaultWorkspace(session.user.id);
  const [currentDna, history, t] = await Promise.all([
    getCurrentContentDna({ workspaceId: workspace.id }),
    getIdeaGenerationBatchHistory({ workspaceId: workspace.id }),
    getTranslations("Ideas"),
  ]);
  const requestedBatchId = typeof search.batchId === "string" ? search.batchId : null;
  const selectedBatchId =
    requestedBatchId && history.batches.some((batch) => batch.id === requestedBatchId)
      ? requestedBatchId
      : history.selectedBatchId;
  const initialDetail = selectedBatchId
    ? await getIdeaGenerationBatch({ workspaceId: workspace.id, batchId: selectedBatchId })
    : null;
  const dnaSummary = toDnaSummary(currentDna);

  return (
    <section className="mx-auto w-full max-w-6xl">
      <IdeasWorkspace
        dna={dnaSummary}
        initialDetail={initialDetail}
        initialHistory={{ ...history, selectedBatchId }}
        key={dnaSummary.currentVersion?.id ?? dnaSummary.status}
        workspaceId={workspace.id}
      />
      <p className="mt-8 max-w-2xl text-xs leading-5 text-muted-foreground">{t("privacyNote")}</p>
    </section>
  );
}
