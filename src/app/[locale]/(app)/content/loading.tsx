import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default async function ContentLoading() {
  const t = await getTranslations("Content");

  return (
    <section
      aria-busy="true"
      aria-labelledby="content-loading-title"
      className="mx-auto w-full max-w-4xl"
    >
      <div className="border-b border-border pb-8">
        <h1
          className="max-w-2xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl"
          id="content-loading-title"
        >
          {t("loadingTitle")}
        </h1>
        <p className="mt-5 max-w-2xl leading-7 text-muted-foreground" role="status">
          {t("loadingDescription")}
        </p>
      </div>
      <Card className="mt-8" aria-hidden="true">
        <CardHeader>
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-4 w-3/5" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </CardContent>
      </Card>
    </section>
  );
}
