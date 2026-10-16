import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getCategoryEntries } from "@/components/catalog/category-entries";
import { categoryHref } from "@/components/catalog/links";
import { ShopView } from "@/components/catalog/shop-view";
import { getAlternates } from "@/i18n/metadata";
import { getPathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { pageOpenGraph } from "@/lib/seo/open-graph";
import { CATEGORY_SLUGS, isCategorySlug } from "@/lib/catalog/categories";

// A page whose entry an admin save just expired renders anew on its next request, never from the build's
// generic fallback shell (docs/standards.md §3, "No build-time shell after an admin save")
export const unstable_paramMatching = { category: "blocking" };

export function generateStaticParams() {
  return CATEGORY_SLUGS.map((category) => ({ category }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/shop/[category]">): Promise<Metadata> {
  const { locale, category } = await params;
  if (!hasLocale(routing.locales, locale) || !isCategorySlug(category)) return {};
  const [entries, t, tCommon] = await Promise.all([
    getCategoryEntries(locale),
    getTranslations({ locale, namespace: "catalog.meta" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const name = entries.find((c) => c.slug === category)?.name ?? category;
  const description = t("categoryDescription", { category: name });
  return {
    title: name,
    description,
    alternates: getAlternates(categoryHref(category), locale),
    // og:image: ./opengraph-image.tsx
    openGraph: pageOpenGraph({
      locale,
      url: getPathname({ href: categoryHref(category), locale }),
      title: name,
      description,
      siteName: tCommon("brand"),
    }),
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/[locale]/shop/[category]">) {
  const locale = (await getLocale()) as Locale;
  // An unknown slug never gets here: the proxy sends it to the global 404 (src/lib/catalog/unknown-category.ts).
  // The params are read inside the view's Suspense boundary, so client navigations stay instant.
  const slug = params.then(({ category }) => (isCategorySlug(category) ? category : notFound()));
  return <ShopView locale={locale} slug={slug} searchParams={searchParams} />;
}
