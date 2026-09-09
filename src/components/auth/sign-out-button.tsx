"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { useTranslations } from "next-intl";
import { useState } from "react";

type SignOutButtonProps = Readonly<{
  userName: string;
}>;

export function SignOutButton({ userName }: SignOutButtonProps) {
  const router = useRouter();
  const t = useTranslations("Auth");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function handleSignOut() {
    setIsSubmitting(true);
    setHasError(false);

    try {
      const result = await authClient.signOut();

      if (result.error) {
        setHasError(true);
        return;
      }

      router.refresh();
    } catch {
      setHasError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <span className="hidden max-w-44 truncate text-xs text-muted-foreground xl:inline">
        {t("signedInAs", { name: userName })}
      </span>
      <Button
        aria-label={`${t("signOut")} · ${t("signedInAs", { name: userName })}`}
        className="min-h-11 px-3 text-xs"
        disabled={isSubmitting}
        onClick={handleSignOut}
        size="sm"
        type="button"
        variant="outline"
      >
        {isSubmitting ? t("signingOut") : t("signOut")}
      </Button>
      {hasError ? (
        <p className="basis-full text-end text-sm text-destructive" role="alert">
          {t("generic")}
        </p>
      ) : null}
    </div>
  );
}
