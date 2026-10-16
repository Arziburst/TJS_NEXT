import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ShopView } from "@/components/catalog/shop-view";
import { getAlternates } from "@/i18n/metadata";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { pageOpenGraph } from "@/lib/seo/open-graph";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tCommon, locale] = await Promise.all([getTranslations("catalog.meta"), getTranslations("common"), getLocale()]);
  return {
    title: t("title"),
    description: t("description"),
    // sort and page variants of the listing all point at the listing itself
    alternates: getAlternates("/shop", locale),
    // og:image: ./opengraph-image.tsx
    openGraph: pageOpenGraph({
      locale: locale as Locale,
      url: getPathname({ href: "/shop", locale }),
      title: t("title"),
      description: t("description"),
      siteName: tCommon("brand"),
    }),
  };
}

export default async function ShopPage({ searchParams }: PageProps<"/[locale]/shop">) {
  const locale = (await getLocale()) as Locale;
  return <ShopView locale={locale} slug={Promise.resolve(null)} searchParams={searchParams} />;
}
