import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "@/i18n/routing";
import { isNewProduct } from "./categories";
import { FAILED_READ_LIFE } from "@/lib/failed-read";
import { getCategories } from "./index";
import { getFacets, getTaxonomyTerms, searchProducts } from "./search";
import type { CatalogResult, Category, Facets, ListingFilters, ListingSort, ProductSummary, TaxonomyTerm } from "./types";

/*
 * The storefront's shared caches. The anonymous client sees the same rows for every visitor, so one entry per
 * locale and query serves everyone. Tags for on-demand revalidation by the admin:
 * - CATALOG_TAG on every entry (any product or category change);
 * - categoryTag(id) on the entries of one category's listing.
 */
export const CATALOG_TAG = "catalog";

export function categoryTag(categoryId: string): string {
  return `category:${categoryId}`;
}

// A failure is cached with zero lifetime: the next request reads again, and it is never baked into a prerender
// (a build without the database still succeeds and renders the data at request time).
function lifeFor(result: CatalogResult<unknown>) {
  if (result.ok) cacheLife("hours");
  else cacheLife(FAILED_READ_LIFE);
}

export async function getCachedCategories(locale: Locale): Promise<CatalogResult<Category[]>> {
  "use cache";
  cacheTag(CATALOG_TAG);
  const result = await getCategories(locale);
  lifeFor(result);
  return result;
}

/** A product of a listing with its "new" badge (D9), computed when the entry is cached. */
export type ListedProduct = ProductSummary & { isNew: boolean };

export type ListingPage = { items: ListedProduct[]; total: number; page: number; pageSize: number };

/**
 * One page of a listing: all products or one category's, filtered and searched (#25). One entry per filter
 * combination: `filters` must be canonical (sorted lists, src/components/catalog/listing.ts).
 */
export async function getCachedListingPage(
  filters: ListingFilters,
  sort: ListingSort,
  page: number,
  pageSize: number,
): Promise<CatalogResult<ListingPage>> {
  "use cache";
  cacheTag(CATALOG_TAG);
  const { locale, categorySlug } = filters;
  const [result, categories] = await Promise.all([
    searchProducts(filters, sort, { page, pageSize }),
    categorySlug ? getCachedCategories(locale) : null,
  ]);
  const category = categories?.ok ? categories.data.find((c) => c.slug === categorySlug) : undefined;
  if (category) cacheTag(categoryTag(category.id));
  // without the category's id the entry would miss its tag: an incomplete read, kept no longer than a failure
  lifeFor(categorySlug && !category ? { ok: false, reason: "unexpectedError" } : result);
  if (!result.ok) return result;
  // the badge is as fresh as the entry (at most hours late), never per request
  const now = Date.now();
  return {
    ok: true,
    data: { ...result.data, items: result.data.items.map((item) => ({ ...item, isNew: isNewProduct(item.createdAt, now) })) },
  };
}

/** The counts per filter option of a listing (any product change can move them: CATALOG_TAG). */
export async function getCachedFacets(filters: ListingFilters): Promise<CatalogResult<Facets>> {
  "use cache";
  cacheTag(CATALOG_TAG);
  const result = await getFacets(filters);
  lifeFor(result);
  return result;
}

/** The materials and colours named in `locale`; the admin's changes expire them (CATALOG_TAG). */
export async function getCachedTaxonomyTerms(locale: Locale): Promise<CatalogResult<TaxonomyTerm[]>> {
  "use cache";
  cacheTag(CATALOG_TAG);
  const result = await getTaxonomyTerms(locale);
  lifeFor(result);
  return result;
}
