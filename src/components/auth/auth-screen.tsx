import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";
import { useTranslations } from "next-intl";

import { AuthForm } from "./auth-form";

type AuthScreenProps = Readonly<{
  mode: "sign-in" | "sign-up";
}>;

export function AuthScreen({ mode }: AuthScreenProps) {
  const t = useTranslations("Auth");
  const isSignUp = mode === "sign-up";

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 gap-10 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
      <section className="self-start lg:self-center">
        <header className="flex items-center justify-between gap-4 border-b border-border pb-5">
          <Link className="text-sm font-semibold tracking-[0.14em] text-foreground uppercase" href="/">
            Better Content
          </Link>
          <LocaleSwitcher />
        </header>

        <div className="pt-12 sm:pt-16">
          <p className="text-sm font-medium tracking-wide text-muted-foreground">{t("eyebrow")}</p>
          <h1 className="mt-4 max-w-md text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {isSignUp ? t("signUpTitle") : t("signInTitle")}
          </h1>
          <p className="mt-5 max-w-md text-pretty leading-7 text-muted-foreground">
            {isSignUp ? t("signUpDescription") : t("signInDescription")}
          </p>
        </div>
      </section>

      <section className="w-full rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8" aria-label={isSignUp ? t("signUpTitle") : t("signInTitle")}>
        <AuthForm mode={mode} />
        <p className="mt-6 border-t border-border pt-5 text-sm text-muted-foreground">
          {isSignUp ? t("hasAccount") : t("needsAccount")}{" "}
          <Link className="font-medium text-foreground underline underline-offset-4 hover:text-primary" href={isSignUp ? "/sign-in" : "/sign-up"}>
            {isSignUp ? t("signInAction") : t("signUpAction")}
          </Link>
        </p>
      </section>
    </main>
  );
}
