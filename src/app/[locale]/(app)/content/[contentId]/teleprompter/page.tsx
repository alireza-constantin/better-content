import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError } from "@/lib/errors/app-error";
import { getTeleprompter } from "@/modules/content/application";
import { Teleprompter } from "@/modules/content/presentation/teleprompter";
import { getOrCreateDefaultWorkspace } from "@/modules/workspace/application";

export default async function TeleprompterPage({
  params,
}: Readonly<{ params: Promise<{ locale: AppLocale; contentId: string }> }>) {
  const [{ locale, contentId }, session, t] = await Promise.all([
    params,
    getServerSession(),
    getTranslations("Teleprompter"),
  ]);

  if (!session) return null;

  const workspace = await getOrCreateDefaultWorkspace(session.user.id);
  let result;
  try {
    result = await getTeleprompter({ workspaceId: workspace.id, contentId });
  } catch (error) {
    if (
      error instanceof ApplicationError &&
      ["NOT_FOUND", "VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN"].includes(error.code)
    ) {
      notFound();
    }
    throw error;
  }

  if (result.status !== "READY") {
    const unavailable = result.status === "UNAVAILABLE";
    return (
      <main
        className="mx-auto flex min-h-[70dvh] w-full max-w-2xl flex-col justify-center px-4 py-12 sm:px-6"
        dir={locale === "fa" ? "rtl" : "ltr"}
        lang={locale}
      >
        <Link
          className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          href={`/content/${result.contentId}`}
        >
          {t("backToEditor")}
        </Link>
        <div className="mt-8 border-s-4 border-[#d9a441] ps-5">
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {unavailable ? t("unavailableTitle") : t("noAcceptedTitle")}
          </h1>
          <p className="mt-5 max-w-xl leading-7 text-muted-foreground">
            {unavailable ? t("unavailableDescription") : t("noAcceptedDescription")}
          </p>
        </div>
      </main>
    );
  }

  return <Teleprompter locale={locale} teleprompter={result} />;
}
