import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { loadMessages } from "./messages";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale: localeOverride }) => {
  const requested = localeOverride ?? (await rootLocale());
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
