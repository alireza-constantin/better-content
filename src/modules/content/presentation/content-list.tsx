import { getTranslations } from "next-intl/server";
import { ArrowUpRightIcon } from "lucide-react";

import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContentListItemDto } from "../application";

type ContentListProps = Readonly<{
  className?: string;
  content: readonly ContentListItemDto[];
  locale: AppLocale;
}>;

function formatDate(date: Date, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatLabel(
  t: Awaited<ReturnType<typeof getTranslations>>,
  format: ContentListItemDto["format"],
): string {
  return format === "SHORT_VIDEO" ? t("shortVideo") : t("longVideo");
}

function languageLabel(
  t: Awaited<ReturnType<typeof getTranslations>>,
  language: ContentListItemDto["contentLanguage"],
): string {
  return language === "fa" ? t("persian") : t("english");
}

export async function ContentList({ className, content, locale }: ContentListProps) {
  const t = await getTranslations("Content");

  if (content.length === 0) {
    return (
      <Card className={`gap-0 border-dashed py-0 shadow-none ${className ?? "mt-5 sm:mt-8"}`}>
        <CardHeader className="px-4 py-5 sm:px-6 sm:py-6">
          <CardTitle>
            <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{t("emptyTitle")}</h2>
          </CardTitle>
          <CardDescription className="max-w-xl leading-6">{t("emptyDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={`gap-0 overflow-hidden py-0 shadow-sm ${className ?? "mt-5 sm:mt-8"}`}>
      <CardHeader className="flex-row items-baseline justify-between gap-3 border-b px-3 py-3 [&.border-b]:pb-3 sm:px-6 sm:py-5 sm:[&.border-b]:pb-5">
        <CardTitle>
          <h2 className="text-base font-semibold tracking-tight sm:text-xl">{t("listLabel")}</h2>
        </CardTitle>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {t("draftCount", { count: content.length })}
        </span>
      </CardHeader>
      <CardContent className="p-2.5 sm:p-5">
        <ul
          aria-label={t("listLabel")}
          className="grid justify-start gap-2 sm:grid-cols-2 sm:gap-4"
        >
          {content.map((item) => (
            <li className="min-w-0 sm:max-w-[22rem]" key={item.id}>
              <Link
                aria-label={t("openEditorFor", { title: item.sourceIdeaTitle })}
                className="group flex min-h-0 flex-col gap-2 rounded-lg border bg-card p-2.5 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-32 sm:justify-between sm:gap-0 sm:p-4"
                href={`/content/${item.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <h2
                    className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground group-hover:underline group-hover:underline-offset-4 sm:text-base"
                    dir={item.contentLanguage === "fa" ? "rtl" : "ltr"}
                    lang={item.contentLanguage}
                    title={item.sourceIdeaTitle}
                  >
                    {item.sourceIdeaTitle}
                  </h2>
                  <span
                    aria-hidden="true"
                    className="mt-1 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
                  >
                    <ArrowUpRightIcon />
                  </span>
                </div>
                <div className="space-y-0.5 text-xs sm:mt-5 sm:space-y-1 sm:text-sm">
                  <p className="truncate text-foreground">
                    {formatLabel(t, item.format)} <span aria-hidden="true">·</span>{" "}
                    {languageLabel(t, item.contentLanguage)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("editedAt")}{" "}
                    <time dateTime={item.lastEditedAt.toISOString()}>
                      {formatDate(item.lastEditedAt, locale)}
                    </time>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
