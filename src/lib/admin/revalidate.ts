import "server-only";

import { updateTag } from "next/cache";
import { CATALOG_TAG, categoryTag, collectionTag } from "@/lib/catalog/cache";
import { COLLECTIONS_TAG, collectionSlugTag } from "@/lib/catalog/collections";
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
 * Expires every storefront entry a collection write can change (#67): the listings and counts (CATALOG_TAG: a
 * collection's sale changes its pieces' prices everywhere), the collection lists of the home page and the shop
 * (COLLECTIONS_TAG), the collection's page and listing, every slug it had or has, and the product pages of every
 * piece it held or holds (their prices follow its sale). Every tag of the write, never fewer: a render started
 * before the write may still be stored after it (#93), so nothing it could have read is left unexpired.
 */
export function revalidateCollection({
  collectionId,
  slugs,
  productIds,
}: {
  collectionId: string;
  slugs: readonly string[];
  productIds: readonly string[];
}): void {
  updateTag(CATALOG_TAG);
  updateTag(COLLECTIONS_TAG);
  updateTag(collectionTag(collectionId));
  for (const slug of new Set(slugs)) updateTag(collectionSlugTag(slug));
  for (const id of new Set(productIds)) updateTag(productCacheTag(id));
}
