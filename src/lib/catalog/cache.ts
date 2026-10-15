import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "@/i18n/routing";
import { isNewProduct } from "./categories";
import { getCategories, getProducts } from "./index";
import type { CatalogResult, Category, ProductSort, ProductSummary } from "./types";

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

// A failure is cached for a minute only: a retry comes soon, and being short-lived it is never baked into a
// prerender (a build without the database still succeeds and renders the data at request time).
function lifeFor(result: CatalogResult<unknown>) {
  if (result.ok) cacheLife("hours");
  else cacheLife("seconds");
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
 * One page of a listing: all products (`categorySlug` null) or one category's. `categoryId` only adds the
 * category's tag; it is null when the category list could not be read.
 */
export async function getCachedListingPage(
  locale: Locale,
  categorySlug: string | null,
  categoryId: string | null,
  sort: ProductSort,
  page: number,
  pageSize: number,
): Promise<CatalogResult<ListingPage>> {
  "use cache";
  cacheTag(CATALOG_TAG);
  if (categoryId) cacheTag(categoryTag(categoryId));
  const result = await getProducts({ locale, categorySlug: categorySlug ?? undefined }, sort, { page, pageSize });
  lifeFor(result);
  if (!result.ok) return result;
  // the badge is as fresh as the entry (at most hours late), never per request
  const now = Date.now();
  return {
    ok: true,
    data: { ...result.data, items: result.data.items.map((item) => ({ ...item, isNew: isNewProduct(item.createdAt, now) })) },
  };
}
