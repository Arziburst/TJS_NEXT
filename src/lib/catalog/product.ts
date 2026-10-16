import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "@/i18n/routing";
import { createPublicServerClient } from "@/lib/supabase/server";
import { FAILED_READ_LIFE } from "@/lib/failed-read";
import { getCategories, getProductBySlug } from "./index";
import { holdRenderForTest } from "./render-hold";
import { isLocale, localesFor } from "./mappers";
import {
  PRODUCT_SLUG_PATTERN,
  productSlugFor,
  resolveProductPath,
  type SlugMatch,
} from "./product-path";
import type { AlternateTranslation } from "@/lib/seo/product";
import type { CatalogResult, Product } from "./types";

/** The cache tag of everything rendered from one product; the admin revalidates it on every change. */
export function productCacheTag(productId: string): string {
  return `product:${productId}`;
}

/**
 * The cache tag of a product page URL's slug, whatever it resolved to: a slug that matched nothing yet (a
 * draft) carries no product tag, so the admin revalidates the slugs a save adds or removes by this tag.
 */
export function productSlugTag(slug: string): string {
  return `product-slug:${slug}`;
}

/**
 * Every published product that has a translation with `slug` (in any locale), with all its translations'
 * slugs. Read as `anon`, so RLS hides drafts, archived and deleted products; the API roles cannot name deleted_at
 * (column grants), so only the status is filtered here.
 */
export async function findSlugMatches(slug: string): Promise<CatalogResult<SlugMatch<AlternateTranslation>[]>> {
  if (!PRODUCT_SLUG_PATTERN.test(slug)) return { ok: false, reason: "invalid" };
  try {
    const { data, error } = await createPublicServerClient()
      .from("product_translations")
      .select("product_id, locale, slug, product:products!inner(product_translations(locale, slug, source, reviewed_at))")
      .eq("slug", slug)
      .eq("product.status", "published");
    if (error) return { ok: false, reason: "unexpectedError" };
    return {
      ok: true,
      data: data.map((row) => ({
        productId: row.product_id,
        locale: row.locale,
        slug: row.slug,
        productSlugs: row.product.product_translations.map((t) => ({
          locale: t.locale,
          slug: t.slug,
          source: t.source,
          reviewedAt: t.reviewed_at,
        })),
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
      /** The product's slug in every locale it is translated into, with its review state: its hreflang alternates. */
      translations: AlternateTranslation[];
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
  cacheTag(productSlugTag(slug));

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
  // a page without its category name (no breadcrumb) is an incomplete read: never kept, never prerendered
  // the product route's shell: no stale window, see daysNoSwr in next.config.ts
  if (categories.ok) cacheLife("daysNoSwr");
  else cacheLife(FAILED_READ_LIFE);

  await holdRenderForTest([product.data.id]);
  return { kind: "ok", product: product.data, categoryName: category?.name ?? null, translations };
}

// a failure is read again by the next request instead of being kept (and is never baked into a prerender)
function failed(): ProductPageData {
  cacheLife(FAILED_READ_LIFE);
  return { kind: "unexpectedError" };
}
