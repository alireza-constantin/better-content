import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { ContentDnaEditor } from "@/modules/dna/presentation/content-dna-editor";
import { getServerSession } from "@/lib/auth/server";
import { getCurrentContentDna } from "@/modules/dna/application";
import { getOrCreateDefaultWorkspace } from "@/modules/workspace/application";

export default async function ContentDnaPage() {
  const session = await getServerSession();

  // The protected layout guarantees this, while retaining a narrow server-only route boundary.
  if (!session) {
    return null;
  }

  const workspace = await getOrCreateDefaultWorkspace(session.user.id);
  const [current, t] = await Promise.all([
    getCurrentContentDna({ workspaceId: workspace.id }),
    getTranslations("ContentDna"),
  ]);

  return (
    <section className="mx-auto w-full max-w-4xl">
      <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        {t("title")}
      </h1>
      <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">{t("description")}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground underline underline-offset-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          href="/content-dna/history"
        >
          {t("viewHistory")}
        </Link>
      </div>
      <ContentDnaEditor initialContentDna={current} workspaceId={workspace.id} />
    </section>
  );
}
