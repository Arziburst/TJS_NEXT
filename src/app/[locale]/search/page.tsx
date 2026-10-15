import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { SEARCH_HREF } from "@/components/catalog/links";
import { ShopView } from "@/components/catalog/shop-view";
import { getAlternates } from "@/i18n/metadata";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("catalog.search.meta"), getLocale()]);
  return {
    title: t("title"),
    description: t("description"),
    alternates: getAlternates(SEARCH_HREF, locale),
    // result pages are endless variations of the listings: crawlers follow their links, never index them
    robots: { index: false, follow: true },
  };
}

/** /<locale>/search?q=…: the shop's products matching the query in the visitor's locale (or en), with the filters. */
export default async function SearchPage({ searchParams }: PageProps<"/[locale]/search">) {
  const locale = (await getLocale()) as Locale;
  return <ShopView locale={locale} slug={Promise.resolve(null)} searchParams={searchParams} context="search" />;
}
