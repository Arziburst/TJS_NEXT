import "server-only";

import { updateTag } from "next/cache";
import { CATALOG_TAG, categoryTag } from "@/lib/catalog/cache";
import { productCacheTag, productSlugTag } from "@/lib/catalog/product";

/**
 * Expires every storefront entry an admin write can change, so the next request reads it again (updateTag:
 * read-your-own-writes, Server Actions only): the listings and categories (CATALOG_TAG), the listings of the
 * product's old and new category, its product pages, and every slug it had or has (a slug that matched
 * nothing before, e.g. while the product was a draft, is cached as not found under its slug tag only).
 */
export function revalidateProduct({
  productId,
  categoryIds,
  slugs,
}: {
  productId: string;
  categoryIds: readonly string[];
  slugs: readonly string[];
}): void {
  updateTag(CATALOG_TAG);
  updateTag(productCacheTag(productId));
  for (const id of new Set(categoryIds)) updateTag(categoryTag(id));
  for (const slug of new Set(slugs)) updateTag(productSlugTag(slug));
}

/**
 * Expires the storefront entries that show the availability of these one-of-a-kind pieces (sold or back on sale
 * after an order's status change): the listings and their product pages, which every slug of a product shares.
 */
export function revalidatePieces(productIds: readonly string[]): void {
  if (productIds.length === 0) return;
  updateTag(CATALOG_TAG);
  for (const id of new Set(productIds)) updateTag(productCacheTag(id));
}
