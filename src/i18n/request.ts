import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { loadMessages } from "./messages";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale: localeOverride, requestLocale }) => {
  // [locale] routes read the root param, which keeps them static; global-not-found has no [locale]
  // segment and falls back to the proxy's X-NEXT-INTL-LOCALE request header (a per-request read)
  const requested = localeOverride ?? (await rootLocale()) ?? (await requestLocale);
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
