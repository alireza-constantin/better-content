import { getTranslations } from "next-intl/server";

import { getServerSession } from "@/lib/auth/server";
import { getCurrentContentDna } from "@/modules/dna/application";
import { getIdeaGenerationBatchHistory, getIdeaLibrary } from "@/modules/ideas/application";
import { parseIdeaLibraryUrlState } from "@/modules/ideas/presentation/idea-library-url-state";
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
  searchParams: Promise<{ view?: string | string[]; batchId?: string | string[] }>;
}>) {
  const [session, search] = await Promise.all([getServerSession(), searchParams]);

  if (!session) {
    return null;
  }

  const workspace = await getOrCreateDefaultWorkspace(session.user.id);
  const urlState = parseIdeaLibraryUrlState(search);
  const [currentDna, history, library, t] = await Promise.all([
    getCurrentContentDna({ workspaceId: workspace.id }),
    getIdeaGenerationBatchHistory({ workspaceId: workspace.id }),
    getIdeaLibrary({
      workspaceId: workspace.id,
      statusFilter: urlState.statusFilter,
      generationBatchId: urlState.batchId,
    }),
    getTranslations("Ideas"),
  ]);
  const dnaSummary = toDnaSummary(currentDna);

  return (
    <section className="mx-auto w-full max-w-6xl">
      <IdeasWorkspace
        dna={dnaSummary}
        initialHistory={history}
        initialLibrary={library}
        key={dnaSummary.currentVersion?.id ?? dnaSummary.status}
        workspaceId={workspace.id}
      />
      <p className="mt-8 max-w-2xl text-xs leading-5 text-muted-foreground">{t("privacyNote")}</p>
    </section>
  );
}
