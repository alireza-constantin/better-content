"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export default function AssetsError({ reset }: Readonly<{ error: Error; reset: () => void }>) {
  const t = useTranslations("AssetLibrary");
  return (
    <section aria-labelledby="asset-library-load-error" className="grid max-w-xl gap-3">
      <h1 className="text-xl font-semibold" id="asset-library-load-error">
        {t("loadErrorTitle")}
      </h1>
      <p className="text-sm text-muted-foreground">{t("loadErrorDescription")}</p>
      <Button className="w-fit" type="button" onClick={reset}>
        {t("retry")}
      </Button>
    </section>
  );
}
