import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ShopView } from "@/components/catalog/shop-view";
import { getAlternates } from "@/i18n/metadata";
import type { Locale } from "@/i18n/routing";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("catalog.meta"), getLocale()]);
  return {
    title: t("title"),
    description: t("description"),
    // sort and page variants of the listing all point at the listing itself
    alternates: getAlternates("/shop", locale),
  };
}

export default async function ShopPage({ searchParams }: PageProps<"/[locale]/shop">) {
  const locale = (await getLocale()) as Locale;
  return <ShopView locale={locale} slug={Promise.resolve(null)} searchParams={searchParams} />;
}
