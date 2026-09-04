import { getTranslations } from "next-intl/server";

import { getServerSession } from "@/lib/auth/server";
import { listContent } from "@/modules/content/application";
import { ContentList } from "@/modules/content/presentation/content-list";
import { getOrCreateDefaultWorkspace } from "@/modules/workspace/application";
import type { AppLocale } from "@/i18n/routing";

export default async function ContentPage({
  params,
}: Readonly<{ params: Promise<{ locale: AppLocale }> }>) {
  const [{ locale }, session, t] = await Promise.all([
    params,
    getServerSession(),
    getTranslations("Content"),
  ]);

  if (!session) {
    return null;
  }

  const workspace = await getOrCreateDefaultWorkspace(session.user.id);
  const content = await listContent({ workspaceId: workspace.id });

  return (
    <section className="mx-auto w-full max-w-4xl">
      <div className="border-b border-border pb-8">
        <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">{t("description")}</p>
      </div>
      <ContentList content={content} locale={locale} />
    </section>
  );
}
