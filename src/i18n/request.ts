import * as rootParams from "next/root-params";
import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";

import enMessages from "../../messages/en.json";
import faMessages from "../../messages/fa.json";
import { isAppLocale, type AppLocale } from "./routing";

const messages: Record<AppLocale, typeof enMessages> = {
  en: enMessages,
  fa: faMessages,
};

export default getRequestConfig(async ({ locale }) => {
  let resolvedLocale = locale;

  if (!resolvedLocale) {
    resolvedLocale = await rootParams.locale();
  }

  if (!isAppLocale(resolvedLocale)) {
    notFound();
  }

  return {
    locale: resolvedLocale,
    messages: messages[resolvedLocale],
  };
});
