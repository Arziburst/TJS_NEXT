import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { createPublicServerClient } from "@/lib/supabase/server";
import { FAILED_READ_LIFE } from "@/lib/failed-read";
import type { SitemapCategory, SitemapCollection, SitemapProduct } from "@/lib/seo/sitemap";
import { CATALOG_TAG } from "./cache";
import { COLLECTIONS_TAG } from "./collections";
import { isLocale } from "./mappers";
import type { CatalogResult } from "./types";

export type SitemapCatalog = { products: SitemapProduct[]; categories: SitemapCategory[]; collections: SitemapCollection[] };

// a page of top-level rows, below the API's max_rows (1000) so a short page always means the last one
const PAGE_SIZE = 500;
// the build prerenders the sitemap too: without a reachable database (CI builds before its stack starts) it
// gives up at once instead of waiting through the client's retries
const READ_TIMEOUT_MS = 10_000;

async function readProducts(): Promise<SitemapProduct[] | null> {
  const client = createPublicServerClient();
  const products: SitemapProduct[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    // anon: RLS hides drafts, archived and deleted products; the status filter keeps it a storefront view
    const { data, error } = await client
      .from("products")
      .select(
        "id, updated_at, category:categories!inner(slug), product_translations(locale, slug, source, reviewed_at, updated_at), product_images(updated_at)",
      )
      .eq("status", "published")
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
      .retry(false)
      .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
    if (error) return null;
    for (const row of data) {
      const imageTimes = row.product_images.map((image) => image.updated_at).sort();
      products.push({
        categorySlug: row.category.slug,
        updatedAt: row.updated_at,
        imagesUpdatedAt: imageTimes.at(-1) ?? null,
        translations: row.product_translations.flatMap((t) =>
          isLocale(t.locale)
            ? [{ locale: t.locale, slug: t.slug, source: t.source, reviewedAt: t.reviewed_at, updatedAt: t.updated_at }]
            : [],
        ),
      });
    }
    if (data.length < PAGE_SIZE) return products;
  }
}

async function readCategories(): Promise<SitemapCategory[] | null> {
  const { data, error } = await createPublicServerClient()
    .from("categories")
    .select("slug, updated_at")
    .order("slug")
    .retry(false)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
  if (error) return null;
  return data.map((row) => ({ slug: row.slug, updatedAt: row.updated_at }));
}

// anon: RLS shows the published collections only (#67)
async function readCollections(): Promise<SitemapCollection[] | null> {
  const { data, error } = await createPublicServerClient()
    .from("collections")
    .select("id, updated_at, collection_translations(locale, slug, source, reviewed_at, updated_at)")
    .eq("is_published", true)
    .order("id")
    .retry(false)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
  if (error) return null;
  return data.map((row) => ({
    updatedAt: row.updated_at,
    translations: row.collection_translations.flatMap((t) =>
      isLocale(t.locale) ? [{ locale: t.locale, slug: t.slug, source: t.source, reviewedAt: t.reviewed_at, updatedAt: t.updated_at }] : [],
    ),
  }));
}

/**
 * Every published product with its translations' slugs and review state, the categories and the published
 * collections, for the sitemap. One entry for everyone, expired by any admin change (CATALOG_TAG,
 * COLLECTIONS_TAG); a failed read is never kept.
 */
export async function getSitemapCatalog(): Promise<CatalogResult<SitemapCatalog>> {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheTag(COLLECTIONS_TAG);
  try {
    const [products, categories, collections] = await Promise.all([readProducts(), readCategories(), readCollections()]);
    if (products === null || categories === null || collections === null) {
      cacheLife(FAILED_READ_LIFE);
      return { ok: false, reason: "unexpectedError" };
    }
    cacheLife("hours");
    return { ok: true, data: { products, categories, collections } };
  } catch {
    cacheLife(FAILED_READ_LIFE);
    return { ok: false, reason: "unexpectedError" };
  }
}
