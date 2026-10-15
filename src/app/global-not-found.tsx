import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LocaleDocument } from "@/components/layout/locale-document";
import { getMetadataBase } from "@/i18n/metadata";
import NotFound from "./[locale]/not-found";
import "./globals.css";

/*
 * Every unmatched URL lands here: the proxy has already redirected it under a locale (/xx/yy -> /en/xx/yy),
 * and the locale comes from the proxy's X-NEXT-INTL-LOCALE request header (src/i18n/request.ts).
 * Reading that header renders this page per request. A notFound() thrown during a Cache Components
 * prerender (the former [locale]/[...rest] catch-all) is served as an empty error shell that only the
 * client fills in, so crawlers and no-JS clients got no 404 text.
 */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const [t, tCommon] = await Promise.all([getTranslations("errors.notFound"), getTranslations("common")]);
  return {
    metadataBase: getMetadataBase(),
    title: `${t("title")} | ${tCommon("brand")}`,
  };
}

export default async function GlobalNotFound() {
  const locale = await getLocale();

  return (
    <LocaleDocument locale={locale}>
      <NotFound />
    </LocaleDocument>
  );
}
