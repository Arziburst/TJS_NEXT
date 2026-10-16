import type { MetadataRoute } from "next";
import { routes } from "@/config/routes";
import { getPathname } from "@/i18n/navigation";
import { defaultLocale, locales, type Locale } from "@/i18n/routing";
import { CATEGORY_SLUGS, type CategorySlug } from "@/lib/catalog/categories";
import { fallbackLocale } from "@/lib/catalog/mappers";
import { isIndexable, type TranslationReview } from "./indexing";
import { collectionPath } from "./collection";
import { productPath } from "./product";

/*
 * The sitemap of the storefront: only pages a search engine may index, one <url> per locale with xhtml:link
 * alternates of the same page in the other indexable locales (each one listing itself too) and x-default on the
 * fallback locale's. The shop's own pages (home, the listing, the categories) are written in every locale's
 * messages, so every locale is indexable; About only in the locales with their own reviewed text (#21); a product is indexable in the locales whose translation is
 * (./indexing.ts). Search, cart, checkout, favorites, account, admin and the demo pages are noindex and never
 * listed. Google reads at most 50 000 URLs per sitemap: 11 locales × (9 pages + the products) stays far below
 * for this catalogue; a sitemap index is the next step once it does not.
 */

export type SitemapTranslation = TranslationReview & { locale: Locale; slug: string; updatedAt: string };

export type SitemapProduct = {
  categorySlug: string;
  /** The product row's updated_at (price, availability, category …). */
  updatedAt: string;
  /** The newest updated_at of its photos, null without photos. */
  imagesUpdatedAt: string | null;
  translations: readonly SitemapTranslation[];
};

export type SitemapCategory = { slug: string; updatedAt: string };

/** A published collection (#67): its page per indexable translation, like a product's. */
export type SitemapCollection = { updatedAt: string; translations: readonly SitemapTranslation[] };

export type SitemapInput = {
  /** The origin every URL is absolute on (getMetadataBase()). */
  base: URL;
  products: readonly SitemapProduct[];
  categories: readonly SitemapCategory[];
  /** The locales whose About page is indexed (src/lib/settings/about.ts); none while it is unpublished. */
  aboutLocales?: readonly Locale[];
  /** The published collections (#67); none when left out. */
  collections?: readonly SitemapCollection[];
};

type Href = Parameters<typeof getPathname>[0]["href"];

/** The newest of ISO timestamps (null and unparsable ones ignored); undefined when there is none. */
export function latest(...timestamps: (string | null | undefined)[]): string | undefined {
  let newest: number | undefined;
  for (const timestamp of timestamps) {
    const time = timestamp ? Date.parse(timestamp) : Number.NaN;
    if (!Number.isNaN(time) && (newest === undefined || time > newest)) newest = time;
  }
  return newest === undefined ? undefined : new Date(newest).toISOString();
}

function entry(url: string, languages: Record<string, string>, lastModified: string | undefined): MetadataRoute.Sitemap[number] {
  return lastModified === undefined ? { url, alternates: { languages } } : { url, lastModified, alternates: { languages } };
}

/** A page of the shop itself: one URL per locale, every locale its alternate. */
function shopPage(base: URL, href: Href, lastModified: string | undefined): MetadataRoute.Sitemap {
  const absolute = (locale: Locale) => new URL(getPathname({ href, locale }), base).href;
  const languages: Record<string, string> = {};
  for (const locale of locales) languages[locale] = absolute(locale);
  languages["x-default"] = absolute(defaultLocale);
  return locales.map((locale) => entry(absolute(locale), languages, lastModified));
}

/** The About page: one URL per locale with its own text, alternates among those, x-default en, else uk. */
function aboutPages(base: URL, aboutLocales: readonly Locale[]): MetadataRoute.Sitemap {
  const indexed = locales.filter((locale) => aboutLocales.includes(locale));
  if (indexed.length === 0) return [];
  const absolute = (locale: Locale) => new URL(getPathname({ href: routes.aboutUs.path, locale }), base).href;
  const languages: Record<string, string> = {};
  for (const locale of indexed) languages[locale] = absolute(locale);
  const xDefault = indexed.includes("en") ? "en" : indexed.includes("uk") ? "uk" : null;
  if (xDefault) languages["x-default"] = absolute(xDefault);
  return indexed.map((locale) => entry(absolute(locale), languages, undefined));
}

/** A product: one URL per indexable translation, alternates only among those. */
function productPages(base: URL, product: SitemapProduct): MetadataRoute.Sitemap {
  return translatedPages(base, product.translations, productPath, (t) => latest(product.updatedAt, product.imagesUpdatedAt, t.updatedAt));
}

/** A collection (#67), the same way: one URL per indexable translation. */
function collectionPages(base: URL, collection: SitemapCollection): MetadataRoute.Sitemap {
  return translatedPages(base, collection.translations, collectionPath, (t) => latest(collection.updatedAt, t.updatedAt));
}

function translatedPages(
  base: URL,
  translations: readonly SitemapTranslation[],
  pathOf: (locale: Locale, slug: string) => string,
  lastModifiedOf: (translation: SitemapTranslation) => string | undefined,
): MetadataRoute.Sitemap {
  const indexable = locales
    .map((locale) => translations.find((t) => t.locale === locale))
    .filter((t): t is SitemapTranslation => t !== undefined && isIndexable(t));
  if (indexable.length === 0) return [];

  const absolute = (t: SitemapTranslation) => new URL(pathOf(t.locale, t.slug), base).href;
  const languages: Record<string, string> = {};
  for (const translation of indexable) languages[translation.locale] = absolute(translation);
  const fallback = indexable.find((t) => t.locale === fallbackLocale);
  if (fallback) languages["x-default"] = absolute(fallback);

  return indexable.map((translation) =>
    entry(absolute(translation), languages, lastModifiedOf(translation)),
  );
}

export function buildSitemap({ base, products, categories, aboutLocales = [], collections = [] }: SitemapInput): MetadataRoute.Sitemap {
  const productChange = (filter: (p: SitemapProduct) => boolean) =>
    latest(
      ...products
        .filter(filter)
        .flatMap((p) => [p.updatedAt, p.imagesUpdatedAt, ...p.translations.map((t) => t.updatedAt)]),
    );

  const categoryPages = CATEGORY_SLUGS.flatMap((slug: CategorySlug) =>
    shopPage(
      base,
      `${routes.shop.path}/${slug}`,
      latest(categories.find((c) => c.slug === slug)?.updatedAt, productChange((p) => p.categorySlug === slug)),
    ),
  );

  return [
    // the home page's content comes from the messages: no date to state
    ...shopPage(base, routes.home.path, undefined),
    ...shopPage(base, routes.shop.path, latest(productChange(() => true), ...categories.map((c) => c.updatedAt))),
    ...categoryPages,
    ...(routes.aboutUs.enabled ? aboutPages(base, aboutLocales) : []),
    ...products.flatMap((product) => productPages(base, product)),
    ...collections.flatMap((collection) => collectionPages(base, collection)),
  ];
}
