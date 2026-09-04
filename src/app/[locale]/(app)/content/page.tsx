import { getTranslations } from "next-intl/server";

import { getServerSession } from "@/lib/auth/server";
import { getContentByIdea, getProductionQueue, listContent } from "@/modules/content/application";
import type { ContentDetailDto, ContentListItemDto } from "@/modules/content/application";
import { ContentList } from "@/modules/content/presentation/content-list";
import { ContentIdeaContext } from "@/modules/content/presentation/content-idea-context";
import { ProductionQueue } from "@/modules/content/presentation/production-queue";
import { toIdeasDnaSummary } from "@/modules/ideas/presentation/ideas-types";
import { getCurrentContentDna as getDna } from "@/modules/dna/application";
import { getOrCreateDefaultWorkspace } from "@/modules/workspace/application";
import type { AppLocale } from "@/i18n/routing";

function toContentListItem(content: ContentDetailDto): ContentListItemDto {
  return {
    id: content.id,
    sourceIdeaTitle: content.sourceIdea.title,
    format: content.format,
    contentLanguage: content.contentLanguage,
    lastEditedAt: content.draft.updatedAt,
  };
}

export default async function ContentPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ ideaId?: string | string[] }>;
}>) {
  const [{ locale }, search, session, t] = await Promise.all([
    params,
    searchParams,
    getServerSession(),
    getTranslations("Content"),
  ]);

  if (!session) {
    return null;
  }

  const workspace = await getOrCreateDefaultWorkspace(session.user.id);
  const sourceIdeaId = typeof search.ideaId === "string" ? search.ideaId : null;
  const currentDna = await getDna({ workspaceId: workspace.id });
  const dna = toIdeasDnaSummary(currentDna);
  const header = (
    <div className="border-b border-border pb-8">
      <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        {t("title")}
      </h1>
      <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">{t("description")}</p>
    </div>
  );

  if (sourceIdeaId) {
    const view = await getContentByIdea({ workspaceId: workspace.id, sourceIdeaId });

    return (
      <section className="mx-auto w-full max-w-6xl">
        {header}
        <ContentIdeaContext
          dna={dna}
          history={view.history}
          sourceIdea={view.sourceIdea}
          workspaceId={workspace.id}
        />
        <ContentList content={view.content.map(toContentListItem)} locale={locale} />
      </section>
    );
  }

  const [content, queue] = await Promise.all([
    listContent({ workspaceId: workspace.id }),
    getProductionQueue({ workspaceId: workspace.id }),
  ]);

  return (
    <section className="mx-auto w-full max-w-6xl">
      {header}
      <ProductionQueue
        dna={dna}
        initialQueue={queue}
        key={queue
          .map(
            (item) =>
              `${item.id}:${item.productionQueuePosition}:${item.lastAttempt?.id ?? "none"}:${item.lastAttempt?.status ?? "none"}`,
          )
          .join("|")}
        workspaceId={workspace.id}
      />
      <ContentList content={content} locale={locale} />
    </section>
  );
}
