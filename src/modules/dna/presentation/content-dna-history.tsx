import { CheckCircle2Icon, CircleDashedIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { ContentDnaVersionDto } from "@/modules/dna/application";

type ContentDnaHistoryProps = Readonly<{
  versions: readonly ContentDnaVersionDto[];
  locale: "en" | "fa";
}>;

type ContentDnaVersionDetailProps = Readonly<{
  version: ContentDnaVersionDto;
  locale: "en" | "fa";
}>;

function ReadinessBadge({ readiness }: Readonly<{ readiness: ContentDnaVersionDto["readiness"] }>) {
  const t = useTranslations("ContentDna");
  const isReady = readiness === "AI_READY";

  return (
    <Badge variant={isReady ? "default" : "secondary"}>
      {isReady ? <CheckCircle2Icon aria-hidden="true" /> : <CircleDashedIcon aria-hidden="true" />}
      {isReady ? t("aiReady") : t("incomplete")}
    </Badge>
  );
}

function VersionBadges({ version }: Readonly<{ version: ContentDnaVersionDto }>) {
  const t = useTranslations("ContentDna");

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t("versionStatus")}>
      {version.isCurrent ? <Badge variant="outline">{t("currentVersion")}</Badge> : null}
      <ReadinessBadge readiness={version.readiness} />
    </div>
  );
}

function formatVersionDate(date: Date, locale: "en" | "fa") {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ContentDnaHistory({ versions, locale }: ContentDnaHistoryProps) {
  const t = useTranslations("ContentDna");

  return (
    <section className="mt-10" aria-labelledby="content-dna-history-list-title">
      <div className="flex flex-col gap-2 border-b border-border pb-5">
        <h2 className="text-xl font-semibold tracking-tight" id="content-dna-history-list-title">
          {t("savedVersions")}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {t("historyDescription")}
        </p>
      </div>

      {versions.length === 0 ? (
        <Card className="mt-6 shadow-none">
          <CardHeader>
            <CardTitle>{t("historyEmptyTitle")}</CardTitle>
            <CardDescription className="max-w-2xl leading-6">
              {t("historyEmptyDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              className="inline-flex min-h-11 items-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              href="/content-dna"
            >
              {t("openEditor")}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ol className="mt-6 divide-y divide-border rounded-xl border bg-card shadow-sm">
          {versions.map((version) => (
            <li key={version.id}>
              <Link
                className="group flex min-h-24 flex-col gap-4 px-5 py-5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                href={`/content-dna/history/${version.id}`}
              >
                <div className="min-w-0">
                  <h3 className="text-base font-semibold tracking-tight underline-offset-4 group-hover:underline">
                    {t("version", { version: version.versionNumber })}
                  </h3>
                  <time
                    className="mt-1 block text-sm text-muted-foreground"
                    dateTime={version.createdAt.toISOString()}
                  >
                    {formatVersionDate(version.createdAt, locale)}
                  </time>
                </div>
                <VersionBadges version={version} />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Value({ children }: Readonly<{ children: string | undefined }>) {
  const t = useTranslations("ContentDna");

  return children ? (
    <p className="whitespace-pre-wrap leading-7" dir="auto">
      {children}
    </p>
  ) : (
    <p className="text-sm text-muted-foreground">{t("notProvided")}</p>
  );
}

function ListValue({ children }: Readonly<{ children: readonly string[] | undefined }>) {
  const t = useTranslations("ContentDna");

  if (!children?.length) {
    return <p className="text-sm text-muted-foreground">{t("notProvided")}</p>;
  }

  return (
    <ul className="flex flex-wrap gap-2" dir="auto">
      {children.map((value) => (
        <li className="rounded-md bg-muted px-2.5 py-1 text-sm" key={value}>
          {value}
        </li>
      ))}
    </ul>
  );
}

function DetailSection({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section
      className="border-b border-border py-6 first:pt-0 last:border-b-0 last:pb-0"
      aria-labelledby={`${title}-heading`}
    >
      <h2 className="text-lg font-semibold tracking-tight" id={`${title}-heading`}>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function LabeledValue({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-medium text-foreground">{label}</dt>
      <dd className="mt-2 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function ContentDnaVersionDetail({ version, locale }: ContentDnaVersionDetailProps) {
  const t = useTranslations("ContentDna");
  const { payload } = version;

  return (
    <article className="mt-10 rounded-xl border bg-card p-5 shadow-sm sm:p-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("version", { version: version.versionNumber })}
          </h1>
          <time
            className="mt-2 block text-sm text-muted-foreground"
            dateTime={version.createdAt.toISOString()}
          >
            {t("savedOn", { date: formatVersionDate(version.createdAt, locale) })}
          </time>
        </div>
        <VersionBadges version={version} />
      </header>

      <div className="mt-6">
        <DetailSection title={t("identity")}>
          <dl>
            <LabeledValue label={t("creatorOrBrandDescription")}>
              <Value>{payload.identity?.creatorOrBrandDescription}</Value>
            </LabeledValue>
          </dl>
        </DetailSection>
        <DetailSection title={t("audience")}>
          <dl>
            <LabeledValue label={t("targetAudienceDescription")}>
              <Value>{payload.audience?.targetAudienceDescription}</Value>
            </LabeledValue>
          </dl>
        </DetailSection>
        <DetailSection title={t("expertiseTopics")}>
          <dl>
            <LabeledValue label={t("primaryTopics")}>
              <ListValue>{payload.expertise?.primaryTopics}</ListValue>
            </LabeledValue>
          </dl>
        </DetailSection>
        <DetailSection title={t("voicePersonality")}>
          <dl className="grid gap-5">
            <LabeledValue label={t("toneTraits")}>
              <ListValue>{payload.voice?.toneTraits}</ListValue>
            </LabeledValue>
            <LabeledValue label={t("preferredStyle")}>
              <Value>{payload.voice?.preferredStyle}</Value>
            </LabeledValue>
          </dl>
        </DetailSection>
        <DetailSection title={t("contentGoals")}>
          <dl>
            <LabeledValue label={t("contentGoals")}>
              <ListValue>{payload.goals?.contentGoals}</ListValue>
            </LabeledValue>
          </dl>
        </DetailSection>
        <DetailSection title={t("preferences")}>
          <dl className="grid gap-5">
            <LabeledValue label={t("preferredFormats")}>
              <ListValue>{payload.preferences?.preferredFormats}</ListValue>
            </LabeledValue>
            <LabeledValue label={t("topicsToAvoid")}>
              <ListValue>{payload.preferences?.topicsToAvoid}</ListValue>
            </LabeledValue>
            <LabeledValue label={t("approachesToAvoid")}>
              <ListValue>{payload.preferences?.approachesToAvoid}</ListValue>
            </LabeledValue>
            <LabeledValue label={t("additionalInstructions")}>
              <Value>{payload.preferences?.additionalInstructions}</Value>
            </LabeledValue>
          </dl>
        </DetailSection>
        <DetailSection title={t("contentLanguages")}>
          <dl className="grid gap-5">
            <LabeledValue label={t("defaultContentLanguage")}>
              <Value>
                {payload.language?.defaultContentLanguage
                  ? t(payload.language.defaultContentLanguage === "en" ? "english" : "persian")
                  : undefined}
              </Value>
            </LabeledValue>
            <LabeledValue label={t("contentLanguages")}>
              <ListValue>
                {payload.language?.contentLanguages?.map((language) =>
                  t(language === "en" ? "english" : "persian"),
                )}
              </ListValue>
            </LabeledValue>
          </dl>
        </DetailSection>
      </div>
    </article>
  );
}
