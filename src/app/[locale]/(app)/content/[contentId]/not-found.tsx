import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ContentNotFound() {
  const t = await getTranslations("Content");

  return (
    <section className="mx-auto w-full max-w-4xl">
      <Card className="border-dashed shadow-none">
        <CardHeader>
          <CardTitle>{t("notFoundTitle")}</CardTitle>
          <CardDescription className="leading-6">{t("notFoundDescription")}</CardDescription>
          <Link
            className="mt-2 inline-flex min-h-11 w-fit items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground underline underline-offset-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            href="/content"
          >
            {t("returnToContent")}
          </Link>
        </CardHeader>
      </Card>
    </section>
  );
}
