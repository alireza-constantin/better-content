import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";
import { Link } from "@/i18n/navigation";
import { isAppLocale } from "@/i18n/routing";
import { getServerSession } from "@/lib/auth/server";

type LocaleHomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function LocaleHomePage({ params }: LocaleHomePageProps) {
  const { locale } = await params;

  if (!isAppLocale(locale)) {
    notFound();
  }

  const [t, session] = await Promise.all([
    getTranslations({ locale, namespace: "HomePage" }),
    getServerSession(),
  ]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8 sm:py-8">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-5">
        <span className="text-sm font-semibold tracking-[0.14em] text-foreground uppercase">
          Better Content
        </span>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <LocaleSwitcher />
          {session ? (
            <SignOutButton userName={session.user.name} />
          ) : (
            <div className="flex items-center gap-3 text-sm font-medium">
              <Link className="text-muted-foreground hover:text-foreground" href="/sign-in">
                {t("signIn")}
              </Link>
              <Link className="rounded-lg bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/80" href="/sign-up">
                {t("signUp")}
              </Link>
            </div>
          )}
        </div>
      </header>

      <section className="flex flex-1 items-center py-16 sm:py-24">
        <div className="max-w-2xl border-s-4 border-primary ps-6 sm:ps-8">
          <p className="text-sm font-medium tracking-wide text-muted-foreground">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            {t("title")}
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            {t("description")}
          </p>
          <p className="mt-8 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">
            <span className="font-medium text-foreground">{t("interfaceLanguage")}</span>{" "}
            {t("languageNote")}
          </p>
        </div>
      </section>
    </main>
  );
}
