import { getTranslations } from "next-intl/server";
import { ArrowUpRightIcon } from "lucide-react";

import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContentListItemDto } from "../application";

type ContentListProps = Readonly<{
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

export async function ContentList({ content, locale }: ContentListProps) {
  const t = await getTranslations("Content");

  if (content.length === 0) {
    return (
      <Card className="mt-8 border-dashed shadow-none">
        <CardHeader>
          <CardTitle>
            <h2 className="text-xl font-semibold tracking-tight">{t("emptyTitle")}</h2>
          </CardTitle>
          <CardDescription className="max-w-xl leading-6">{t("emptyDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="mt-8 overflow-hidden shadow-sm">
      <CardHeader className="flex-row items-baseline justify-between gap-4 border-b px-4 py-4 sm:px-6 sm:py-5">
        <CardTitle>
          <h2 className="text-xl font-semibold tracking-tight">{t("listLabel")}</h2>
        </CardTitle>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {t("draftCount", { count: content.length })}
        </span>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        <ul aria-label={t("listLabel")} className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {content.map((item) => (
            <li className="min-w-0" key={item.id}>
              <Link
                aria-label={t("openEditorFor", { title: item.sourceIdeaTitle })}
                className="group flex min-h-32 flex-col justify-between rounded-lg border bg-card p-4 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                href={`/content/${item.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <h2
                    className="min-w-0 truncate text-base font-semibold tracking-tight text-foreground group-hover:underline group-hover:underline-offset-4"
                    dir="auto"
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
                <div className="mt-5 space-y-1 text-sm">
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
