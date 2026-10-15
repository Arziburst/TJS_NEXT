import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "@/i18n/routing";
import { createPublicServerClient } from "@/lib/supabase/server";
import { getCategories, getProductBySlug } from "./index";
import { isLocale, localesFor } from "./mappers";
import {
  PRODUCT_SLUG_PATTERN,
  productSlugFor,
  resolveProductPath,
  type SlugMatch,
  type TranslationSlug,
} from "./product-path";
import type { CatalogResult, Product } from "./types";

/** The cache tag of everything rendered from one product; the admin revalidates it on every change. */
export function productCacheTag(productId: string): string {
  return `product:${productId}`;
}

/**
 * Every published product that has a translation with `slug` (in any locale), with all its translations'
 * slugs. Read as `anon`, so RLS hides drafts, archived and deleted products, like the explicit filters.
 */
export async function findSlugMatches(slug: string): Promise<CatalogResult<SlugMatch[]>> {
  if (!PRODUCT_SLUG_PATTERN.test(slug)) return { ok: false, reason: "invalid" };
  try {
    const { data, error } = await createPublicServerClient()
      .from("product_translations")
      .select("product_id, locale, slug, product:products!inner(product_translations(locale, slug))")
      .eq("slug", slug)
      .eq("product.status", "published")
      .is("product.deleted_at", null);
    if (error) return { ok: false, reason: "unexpectedError" };
    return {
      ok: true,
      data: data.map((row) => ({
        productId: row.product_id,
        locale: row.locale,
        slug: row.slug,
        productSlugs: row.product.product_translations,
      })),
    };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

// generateStaticParams reads once per locale at build time; a build without a reachable database (CI builds
// before its stack starts) gives up at once instead of waiting through the client's retries per locale
const BUILD_READ_TIMEOUT_MS = 5_000;

/** The URL slug in `locale` of every published product: its own translation's, else the fallback's. */
export async function getProductSlugs(locale: Locale): Promise<CatalogResult<string[]>> {
  if (!isLocale(locale)) return { ok: false, reason: "invalid" };
  try {
    const { data, error } = await createPublicServerClient()
      .from("products")
      .select("id, product_translations!inner(locale, slug)")
      .eq("status", "published")
      .is("deleted_at", null)
      .in("product_translations.locale", localesFor(locale))
      .order("id")
      .retry(false)
      .abortSignal(AbortSignal.timeout(BUILD_READ_TIMEOUT_MS));
    if (error) return { ok: false, reason: "unexpectedError" };
    const slugs = data
      .map((row) => productSlugFor(row.product_translations, locale))
      .filter((slug): slug is string => slug !== null);
    return { ok: true, data: slugs };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

export type ProductPageData =
  | {
      kind: "ok";
      product: Product;
      /** The category's name in the locale (or the fallback), null when it cannot be read. */
      categoryName: string | null;
      /** The product's slug in every locale it is translated into: its hreflang alternates. */
      translations: TranslationSlug[];
    }
  | { kind: "redirect"; slug: string }
  | { kind: "notFound" }
  | { kind: "unexpectedError" };

/**
 * What /<locale>/product/<slug> shows, cached for every visitor and tagged `product:<id>`. A missing slug
 * is cached briefly (a product published later appears within minutes even without a revalidation).
 */
export async function getProductPage(locale: Locale, slug: string): Promise<ProductPageData> {
  "use cache";
  if (!isLocale(locale) || !PRODUCT_SLUG_PATTERN.test(slug)) {
    cacheLife("max");
    return { kind: "notFound" };
  }

  const matches = await findSlugMatches(slug);
  if (!matches.ok) return failed();
  for (const match of matches.data) cacheTag(productCacheTag(match.productId));

  const resolution = resolveProductPath(matches.data, locale, slug);
  if (resolution.kind === "notFound") {
    cacheLife("minutes");
    return resolution;
  }
  if (resolution.kind === "redirect") {
    cacheLife("days");
    return { kind: "redirect", slug: resolution.slug };
  }

  const [product, categories] = await Promise.all([getProductBySlug(locale, slug), getCategories(locale)]);
  if (!product.ok) {
    if (product.reason !== "notFound") return failed();
    cacheLife("minutes");
    return { kind: "notFound" };
  }
  const translations = matches.data.find((m) => m.productId === resolution.productId)?.productSlugs ?? [];
  const category = categories.ok ? categories.data.find((c) => c.id === product.data.category.id) : undefined;
  // a page without its category name is retried soon
  if (categories.ok) cacheLife("days");
  else cacheLife("minutes");

  return { kind: "ok", product: product.data, categoryName: category?.name ?? null, translations };
}

// a failure is retried soon instead of being kept for days (and is never baked into a prerender)
function failed(): ProductPageData {
  cacheLife("seconds");
  return { kind: "unexpectedError" };
}
