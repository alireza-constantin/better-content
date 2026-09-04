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
      <CardHeader className="border-b">
        <CardTitle>
          <h2 className="text-xl font-semibold tracking-tight">{t("listLabel")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul aria-label={t("listLabel")} className="divide-y divide-border">
          {content.map((item) => (
            <li key={item.id}>
              <Link
                aria-label={t("openEditorFor", { title: item.sourceIdeaTitle })}
                className="group block min-h-11 px-6 py-5 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                href={`/content/${item.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <h2
                    className="min-w-0 text-lg font-semibold tracking-tight text-foreground group-hover:underline group-hover:underline-offset-4"
                    dir="auto"
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
                <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {t("format")}
                    </dt>
                    <dd className="mt-1 font-medium text-foreground">
                      {formatLabel(t, item.format)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {t("contentLanguage")}
                    </dt>
                    <dd className="mt-1 font-medium text-foreground">
                      {languageLabel(t, item.contentLanguage)}
                    </dd>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {t("lastEdited")}
                    </dt>
                    <dd className="mt-1 font-medium tabular-nums text-foreground">
                      <time dateTime={item.lastEditedAt.toISOString()}>
                        {formatDate(item.lastEditedAt, locale)}
                      </time>
                    </dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
