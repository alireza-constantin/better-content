import { getTranslations } from "next-intl/server";

export default async function DashboardPage() {
  const t = await getTranslations("Dashboard");

  return (
    <section className="max-w-2xl">
      <p className="text-sm font-medium tracking-wide text-muted-foreground">{t("eyebrow")}</p>
      <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        {t("title")}
      </h1>
      <p className="mt-5 max-w-xl text-pretty leading-7 text-muted-foreground">{t("description")}</p>
    </section>
  );
}
