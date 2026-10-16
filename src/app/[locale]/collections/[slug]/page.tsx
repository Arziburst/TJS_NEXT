import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { collectionHref } from "@/components/catalog/links";
import { ShopView } from "@/components/catalog/shop-view";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getCollectionPage, getCollectionSlugs, type Collection } from "@/lib/catalog/collections";
import { collectionAlternates, collectionPath } from "@/lib/seo/collection";
import { translationRobots } from "@/lib/seo/indexing";

/*
 * A collection's page (#67): its name, description and cover above the shop's grid of its pieces, with the shop's
 * filters and sorts (the owner's order first). Unknown and unpublished slugs answer 404 in the proxy
 * (src/proxy/collection-not-found.ts) before this page renders, as for products; a slug of another locale redirects.
 */

// A slug no collection can have: the build still validates the route without collections or a database.
const UNAVAILABLE_SLUG = "-";

// A page whose entry an admin save just expired renders anew on its next request, never from the build's
// generic fallback shell (docs/standards.md §3, "No build-time shell after an admin save")
export const unstable_paramMatching = { slug: "blocking" };

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale = hasLocale(routing.locales, params.locale) ? params.locale : routing.defaultLocale;
  const slugs = await getCollectionSlugs(locale);
  if (!slugs.ok || slugs.data.length === 0) return [{ slug: UNAVAILABLE_SLUG }];
  return slugs.data.map((slug) => ({ slug }));
}

async function readParams(params: PageProps<"/[locale]/collections/[slug]">["params"]) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return { locale, slug };
}

export async function generateMetadata({ params }: PageProps<"/[locale]/collections/[slug]">): Promise<Metadata> {
  const { locale, slug } = await readParams(params);
  const [page, t] = await Promise.all([getCollectionPage(locale, slug), getTranslations({ locale, namespace: "catalog.collections" })]);
  if (page.kind !== "ok") return {};
  const { collection } = page;
  const description = collection.description ?? t("metaDescription", { name: collection.name });
  return {
    title: collection.name,
    description,
    alternates: collectionAlternates(collection.translations, collection),
    // an unreviewed machine translation is shown, but not indexed (src/lib/seo/indexing.ts)
    robots: translationRobots(collection),
    openGraph: {
      title: collection.name,
      description,
      url: collectionPath(collection.locale, collection.slug),
      images: collection.cover ? [{ url: collection.cover.url, width: collection.cover.width, height: collection.cover.height }] : [],
    },
  };
}

export default async function CollectionPage({ params, searchParams }: PageProps<"/[locale]/collections/[slug]">) {
  const locale = (await getLocale()) as Locale;
  // read inside the view's Suspense boundary, so client navigations stay instant
  const collection = readParams(params).then(async ({ slug }): Promise<Collection> => {
    const page = await getCollectionPage(locale, slug);
    if (page.kind === "notFound") notFound();
    if (page.kind === "redirect") redirect({ href: collectionHref(page.slug), locale });
    if (page.kind !== "ok") throw new Error(`collection page: ${page.kind}`);
    return page.collection;
  });
  return <ShopView locale={locale} slug={Promise.resolve(null)} collection={collection} searchParams={searchParams} context="collection" />;
}
