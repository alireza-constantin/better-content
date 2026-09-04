import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError } from "@/lib/errors/app-error";
import { getContentDetail } from "@/modules/content/application";
import { ContentEditor } from "@/modules/content/presentation/content-editor";
import { getOrCreateDefaultWorkspace } from "@/modules/workspace/application";

export default async function ContentDetailPage({
  params,
}: Readonly<{ params: Promise<{ locale: AppLocale; contentId: string }> }>) {
  const [{ contentId }, session, t] = await Promise.all([
    params,
    getServerSession(),
    getTranslations("Content"),
  ]);

  if (!session) {
    return null;
  }

  const workspace = await getOrCreateDefaultWorkspace(session.user.id);
  let content;

  try {
    content = await getContentDetail({ workspaceId: workspace.id, contentId });
  } catch (error) {
    if (
      error instanceof ApplicationError &&
      ["NOT_FOUND", "VALIDATION_ERROR"].includes(error.code)
    ) {
      notFound();
    }

    throw error;
  }

  return (
    <section className="mx-auto w-full max-w-4xl">
      <Link
        className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        href="/content"
      >
        {t("backToContent")}
      </Link>
      <div className="mt-8 border-b border-border pb-8">
        <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {t("editorTitle")}
        </h1>
        <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">{t("editorDescription")}</p>
      </div>
      <ContentEditor content={content} workspaceId={workspace.id} />
    </section>
  );
}
