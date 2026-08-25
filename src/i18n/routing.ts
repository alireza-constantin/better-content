import { defineRouting } from "next-intl/routing";

export const appLocales = ["en", "fa"] as const;

export type AppLocale = (typeof appLocales)[number];

export const routing = defineRouting({
  locales: appLocales,
  defaultLocale: "en",
  localePrefix: "always",
});

export function isAppLocale(value: string | undefined): value is AppLocale {
  return appLocales.some((locale) => locale === value);
}

export function getTextDirection(locale: AppLocale): "ltr" | "rtl" {
  return locale === "fa" ? "rtl" : "ltr";
}
