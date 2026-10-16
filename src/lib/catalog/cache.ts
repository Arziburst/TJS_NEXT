import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "@/i18n/routing";
import { isNewProduct } from "./categories";
import { FAILED_READ_LIFE } from "@/lib/failed-read";
import { getCategories } from "./index";
import { holdRenderForTest } from "./render-hold";
import { lifeUntilSaleChange } from "./sale";
import { readNextSaleChange } from "./sale-life";
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

/** The entries of one collection (#67): its page, its listing and its counts. */
export function collectionTag(collectionId: string): string {
  return `collection:${collectionId}`;
}

// A failure is cached with zero lifetime: the next request reads again, and it is never baked into a prerender
// (a build without the database still succeeds and renders the data at request time).
function lifeFor(result: CatalogResult<unknown>) {
  if (result.ok) cacheLife("hours");
  else cacheLife(FAILED_READ_LIFE);
}

const HOURS_REVALIDATE_SECONDS = 3600;

// An entry with prices (#67) lives no longer than until the next sale starts or ends; without that moment it
// would keep a sale's prices past its end, so a failure to read it is a failed read.
function priceLifeFor(result: CatalogResult<unknown>, nextSaleChange: number | null | undefined) {
  if (!result.ok || nextSaleChange === undefined) return cacheLife(FAILED_READ_LIFE);
  const bounded = lifeUntilSaleChange(HOURS_REVALIDATE_SECONDS, nextSaleChange, Date.now());
  if (bounded) cacheLife(bounded);
  else cacheLife("hours");
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
  if (filters.collectionId) cacheTag(collectionTag(filters.collectionId));
  const [result, categories, nextSaleChange] = await Promise.all([
    searchProducts(filters, sort, { page, pageSize }),
    categorySlug ? getCachedCategories(locale) : null,
    readNextSaleChange(),
  ]);
  const category = categories?.ok ? categories.data.find((c) => c.slug === categorySlug) : undefined;
  if (category) cacheTag(categoryTag(category.id));
  // without the category's id the entry would miss its tag: an incomplete read, kept no longer than a failure
  priceLifeFor(categorySlug && !category ? { ok: false, reason: "unexpectedError" } : result, nextSaleChange);
  if (!result.ok) return result;
  await holdRenderForTest(result.data.items.map((item) => item.id));
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
  if (filters.collectionId) cacheTag(collectionTag(filters.collectionId));
  // the price filter counts by the sale price
  const [result, nextSaleChange] = await Promise.all([getFacets(filters), readNextSaleChange()]);
  priceLifeFor(result, nextSaleChange);
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
