"use client";

import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ContentError({ reset }: Readonly<{ reset: () => void }>) {
  const t = useTranslations("Content");

  return (
    <section className="mx-auto w-full max-w-4xl" aria-labelledby="content-error-title">
      <Alert variant="destructive" aria-live="assertive">
        <AlertCircleIcon />
        <AlertTitle id="content-error-title">{t("errorTitle")}</AlertTitle>
        <AlertDescription>
          <p>{t("errorDescription")}</p>
          <Button className="mt-3 min-h-11" onClick={reset} type="button" variant="outline">
            <RefreshCwIcon data-icon="inline-start" />
            {t("retryLoad")}
          </Button>
        </AlertDescription>
      </Alert>
    </section>
  );
}
