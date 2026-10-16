import "server-only";

import { createPublicServerClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import {
  isLocale,
  localesFor,
  mapCategory,
  mapProduct,
  toSummary,
  type ProductRow,
} from "./mappers";
import type {
  CatalogResult,
  Category,
  PageRequest,
  Product,
  ProductFilters,
  ProductPage,
  ProductSort,
} from "./types";

export type * from "./types";

export const PRODUCT_IMAGES_BUCKET = "product-images";
/** Technical upper bound of one page, well below the API's max_rows. */
export const MAX_PAGE_SIZE = 100;

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FULFILLMENTS = ["made_to_order", "one_of_a_kind"] as const;
const AVAILABILITIES = ["available", "reserved", "sold"] as const;
const SORTS: readonly ProductSort[] = ["newest", "price_asc", "price_desc"];

// The storefront reads through the anonymous client: RLS hides drafts, archived and soft-deleted products,
// and the column grants hide the internal columns (hs_code, deleted_at, created_by, updated_by), so
// they are neither selected nor filtered on here. The explicit status filter keeps it a storefront view for any client.
export const PRODUCT_COLUMNS = `
  id, sku, fulfillment, availability, lead_time_min_days, lead_time_max_days, price_usd_text:price_usd::text, weight_g,
  length_mm, width_mm, height_mm,
  created_at, published_at,
  category:categories!inner(id, slug),
  product_translations!inner(locale, slug, title, description, materials, care, clasp, lead_time_note, alt_text, meta_title, meta_description, source, reviewed_at),
  product_images(id, storage_path, position, width, height, blur_data_url, product_image_alts(locale, alt)),
  product_variants(id, position, sku_suffix, price_delta_usd_minor, is_available, product_variant_translations(locale, label))
`;

function publicUrlFor(client: ServerSupabaseClient) {
  return (path: string) => client.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function mapRows(rows: ProductRow[], locale: Locale, client: ServerSupabaseClient): Product[] {
  const urlFor = publicUrlFor(client);
  return rows.map((row) => mapProduct(row, locale, urlFor)).filter((p): p is Product => p !== null);
}

/** Categories in their manual order, named in `locale` (or the fallback locale). */
export async function getCategories(locale: Locale): Promise<CatalogResult<Category[]>> {
  if (!isLocale(locale)) return { ok: false, reason: "invalid" };
  try {
    const client = createPublicServerClient();
    const { data, error } = await client
      .from("categories")
      .select("id, slug, position, category_translations(locale, name, source)")
      .in("category_translations.locale", localesFor(locale))
      .order("position")
      .order("slug");
    if (error) return { ok: false, reason: "unexpectedError" };
    const categories = data
      .map((row) => mapCategory(row, locale))
      .filter((c): c is Category => c !== null);
    return { ok: true, data: categories };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

function validFilters(filters: ProductFilters): boolean {
  if (!isLocale(filters.locale)) return false;
  if (filters.categorySlug !== undefined && !SLUG_PATTERN.test(filters.categorySlug)) return false;
  if (filters.fulfillment !== undefined && !FULFILLMENTS.includes(filters.fulfillment)) return false;
  if (filters.availability !== undefined) {
    if (filters.availability.length === 0) return false;
    if (!filters.availability.every((a) => AVAILABILITIES.includes(a))) return false;
  }
  return true;
}

function validPage({ page, pageSize }: PageRequest): boolean {
  return (
    Number.isSafeInteger(page) && page >= 1 && Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= MAX_PAGE_SIZE
  );
}

/**
 * One page of published products: filtered by category, fulfillment and availability, sorted newest first
 * or by price, with the translation in `filters.locale` (or the fallback locale).
 */
export async function getProducts(
  filters: ProductFilters,
  sort: ProductSort,
  page: PageRequest,
): Promise<CatalogResult<ProductPage>> {
  if (!validFilters(filters) || !SORTS.includes(sort) || !validPage(page)) return { ok: false, reason: "invalid" };
  const { locale } = filters;
  try {
    const client = createPublicServerClient();
    const filtered = (head: boolean) => {
      let query = client
        .from("products")
        .select(PRODUCT_COLUMNS, { count: "exact", head })
        .eq("status", "published")
        .in("product_translations.locale", localesFor(locale));
      if (filters.categorySlug !== undefined) query = query.eq("category.slug", filters.categorySlug);
      if (filters.fulfillment !== undefined) query = query.eq("fulfillment", filters.fulfillment);
      if (filters.availability !== undefined) query = query.in("availability", filters.availability);
      return query;
    };

    let query = filtered(false);
    query =
      sort === "newest"
        ? query.order("created_at", { ascending: false })
        : query.order("price_usd", { ascending: sort === "price_asc" }).order("created_at", { ascending: false });

    const from = (page.page - 1) * page.pageSize;
    const { data, error, count } = await query
      .order("id")
      .order("position", { referencedTable: "product_images" })
      .range(from, from + page.pageSize - 1);
    // PostgREST answers a page past the end with 416 (PGRST103) and no count: an empty page, not a
    // failure; the total then comes from a head-only count.
    if (error?.code === "PGRST103") {
      const counted = await filtered(true);
      if (counted.error) return { ok: false, reason: "unexpectedError" };
      return { ok: true, data: { items: [], total: counted.count ?? 0, page: page.page, pageSize: page.pageSize } };
    }
    if (error) return { ok: false, reason: "unexpectedError" };

    const items = mapRows(data, locale, client).map(toSummary);
    return { ok: true, data: { items, total: count ?? items.length, page: page.page, pageSize: page.pageSize } };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

/**
 * A published product by its slug in `locale`, or by its fallback-locale slug when it has no translation in
 * `locale`. If the product does have a translation in `locale` under another slug, that translation is
 * returned: the caller redirects when `product.translation.slug !== slug`.
 */
export async function getProductBySlug(locale: Locale, slug: string): Promise<CatalogResult<Product>> {
  if (!isLocale(locale) || !SLUG_PATTERN.test(slug)) return { ok: false, reason: "invalid" };
  try {
    const client = createPublicServerClient();
    const { data: matches, error: matchError } = await client
      .from("product_translations")
      .select("product_id, locale")
      .eq("slug", slug)
      .in("locale", localesFor(locale));
    if (matchError) return { ok: false, reason: "unexpectedError" };
    const match = matches.find((m) => m.locale === locale) ?? matches[0];
    if (!match) return { ok: false, reason: "notFound" };

    const { data, error } = await client
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("id", match.product_id)
      .eq("status", "published")
      .in("product_translations.locale", localesFor(locale))
      .order("position", { referencedTable: "product_images" })
      .maybeSingle();
    if (error) return { ok: false, reason: "unexpectedError" };
    if (!data) return { ok: false, reason: "notFound" };

    const [product] = mapRows([data], locale, client);
    return product ? { ok: true, data: product } : { ok: false, reason: "notFound" };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}
