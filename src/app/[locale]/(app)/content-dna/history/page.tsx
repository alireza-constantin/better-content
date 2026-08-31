import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { getServerSession } from "@/lib/auth/server";
import { listContentDnaVersions } from "@/modules/dna/application";
import { ContentDnaHistory } from "@/modules/dna/presentation/content-dna-history";
import { getOrCreateDefaultWorkspace } from "@/modules/workspace/application";

export default async function ContentDnaHistoryPage({
  params,
}: Readonly<{ params: Promise<{ locale: "en" | "fa" }> }>) {
  const [{ locale }, session, t] = await Promise.all([
    params,
    getServerSession(),
    getTranslations("ContentDna"),
  ]);

  if (!session) return null;

  const workspace = await getOrCreateDefaultWorkspace(session.user.id);
  const versions = await listContentDnaVersions({ workspaceId: workspace.id });

  return (
    <section className="mx-auto w-full max-w-4xl">
      <div className="flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {t("historyTitle")}
          </h1>
          <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">
            {t("historyPageDescription")}
          </p>
        </div>
        <Link
          className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-center text-sm font-medium text-foreground underline underline-offset-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          href="/content-dna"
        >
          {t("openEditor")}
        </Link>
      </div>
      <ContentDnaHistory locale={locale} versions={versions} />
    </section>
  );
}
