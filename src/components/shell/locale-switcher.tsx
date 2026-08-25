"use client";

import { useLocale, useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const localeOptions = [
  { locale: "en", labelKey: "english" },
  { locale: "fa", labelKey: "persian" },
] as const;

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("LocaleSwitcher");

  return (
    <nav aria-label={t("label")}>
      <ul className="flex items-center gap-1 rounded-full border border-border bg-background p-1 shadow-sm">
        {localeOptions.map((option) => {
          const isActive = option.locale === locale;

          return (
            <li key={option.locale}>
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-8 items-center rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                href={pathname}
                locale={option.locale}
              >
                {t(option.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
