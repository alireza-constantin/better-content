import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError } from "@/lib/errors/app-error";
import { getContentDnaVersion } from "@/modules/dna/application";
import { ContentDnaVersionDetail } from "@/modules/dna/presentation/content-dna-history";
import { getOrCreateDefaultWorkspace } from "@/modules/workspace/application";

export default async function ContentDnaVersionDetailPage({
  params,
}: Readonly<{ params: Promise<{ locale: "en" | "fa"; versionId: string }> }>) {
  const [{ locale, versionId }, session, t] = await Promise.all([
    params,
    getServerSession(),
    getTranslations("ContentDna"),
  ]);

  if (!session) return null;

  const workspace = await getOrCreateDefaultWorkspace(session.user.id);

  let version;

  try {
    version = await getContentDnaVersion({ workspaceId: workspace.id, versionId });
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
        href="/content-dna/history"
      >
        {t("backToHistory")}
      </Link>
      <ContentDnaVersionDetail locale={locale} version={version} />
    </section>
  );
}
