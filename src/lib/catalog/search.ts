import "server-only";

import type { Locale } from "@/i18n/routing";
import { createPublicServerClient } from "@/lib/supabase/server";
import { MAX_PAGE_SIZE, mapRows, PRODUCT_COLUMNS, SLUG_PATTERN } from "./index";
import { isLocale, localesFor, toSummary } from "./mappers";
import { MAX_USD_MINOR } from "./price-filter";
import type {
  AvailabilityFilter,
  CatalogResult,
  Facets,
  ListingFilters,
  ListingSort,
  PageRequest,
  ProductPage,
  TaxonomyKind,
  TaxonomyTerm,
} from "./types";

/*
 * The storefront's filtered listings and search (#25). The database picks and orders the products
 * (public.shop_search, public.shop_facets); the products themselves are read like every storefront read,
 * through the anonymous client under RLS.
 */

const SORTS: readonly ListingSort[] = ["newest", "price_asc", "price_desc", "relevance"];
const AVAILABILITY: readonly AvailabilityFilter[] = ["in_stock", "made_to_order"];
const KINDS: readonly TaxonomyKind[] = ["material", "colour"];
// the database's limits (private.shop_candidates)
const MAX_TERMS = 8;
const MAX_TERM_LENGTH = 64;
const MAX_VALUES = 50;

function validBound(value: number | null): boolean {
  return value === null || (Number.isSafeInteger(value) && value >= 0 && value <= MAX_USD_MINOR + 1);
}

function validFilters(f: ListingFilters): boolean {
  return (
    isLocale(f.locale) &&
    (f.categorySlug === null || SLUG_PATTERN.test(f.categorySlug)) &&
    f.terms.length <= MAX_TERMS &&
    f.terms.every((t) => t.length > 0 && t.length <= MAX_TERM_LENGTH) &&
    f.materials.length <= MAX_VALUES &&
    f.colours.length <= MAX_VALUES &&
    [...f.materials, ...f.colours].every((slug) => SLUG_PATTERN.test(slug)) &&
    f.availability.every((a) => AVAILABILITY.includes(a)) &&
    validBound(f.priceMinUsdMinor) &&
    validBound(f.priceMaxUsdMinor)
  );
}

function validPage({ page, pageSize }: PageRequest): boolean {
  return (
    Number.isSafeInteger(page) && page >= 1 && Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= MAX_PAGE_SIZE
  );
}

// the database functions' filter arguments; empty lists and open bounds stay unset
function filterArgs(f: ListingFilters) {
  return {
    p_locale: f.locale,
    ...(f.categorySlug !== null && { p_category: f.categorySlug }),
    ...(f.terms.length > 0 && { p_terms: f.terms }),
    ...(f.materials.length > 0 && { p_materials: f.materials }),
    ...(f.colours.length > 0 && { p_colours: f.colours }),
    ...(f.priceMinUsdMinor !== null && { p_price_min_minor: f.priceMinUsdMinor }),
    ...(f.priceMaxUsdMinor !== null && { p_price_max_minor: f.priceMaxUsdMinor }),
    ...(f.availability.length > 0 && { p_availability: f.availability }),
  };
}

/**
 * One page of the published products that pass `filters`, in `sort` order (relevance needs search terms,
 * else it is newest first), each with its translation in the locale or the fallback.
 */
export async function searchProducts(
  filters: ListingFilters,
  sort: ListingSort,
  page: PageRequest,
): Promise<CatalogResult<ProductPage>> {
  if (!validFilters(filters) || !SORTS.includes(sort) || !validPage(page)) return { ok: false, reason: "invalid" };
  const { locale } = filters;
  try {
    const client = createPublicServerClient();
    const { data, error } = await client
      .rpc("shop_search", {
        ...filterArgs(filters),
        p_sort: sort === "relevance" && filters.terms.length === 0 ? "newest" : sort,
        p_limit: page.pageSize,
        p_offset: (page.page - 1) * page.pageSize,
      })
      .single();
    if (error) return { ok: false, reason: "unexpectedError" };
    const { ids, total } = data;
    const empty = { items: [], total, page: page.page, pageSize: page.pageSize };
    if (ids.length === 0) return { ok: true, data: empty };

    const products = await client
      .from("products")
      .select(PRODUCT_COLUMNS)
      .in("id", ids)
      .eq("status", "published")
      .in("product_translations.locale", localesFor(locale))
      .order("position", { referencedTable: "product_images" });
    if (products.error) return { ok: false, reason: "unexpectedError" };

    // the database's order; a product unpublished between the two reads is left out
    const byId = new Map(mapRows(products.data, locale, client).map((p) => [p.id, p]));
    const items = ids.flatMap((id) => {
      const product = byId.get(id);
      return product ? [toSummary(product)] : [];
    });
    return { ok: true, data: { ...empty, items } };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

/** The number of products per filter option of a listing, each option counted with all other filters applied. */
export async function getFacets(filters: ListingFilters): Promise<CatalogResult<Facets>> {
  if (!validFilters(filters)) return { ok: false, reason: "invalid" };
  try {
    const { data, error } = await createPublicServerClient().rpc("shop_facets", filterArgs(filters));
    if (error) return { ok: false, reason: "unexpectedError" };
    const facets: Facets = { material: {}, colour: {}, availability: {} };
    for (const { facet, value, count } of data) {
      if (facet === "material" || facet === "colour") facets[facet][value] = count;
      else if (facet === "availability" && AVAILABILITY.includes(value as AvailabilityFilter)) {
        facets.availability[value as AvailabilityFilter] = count;
      }
    }
    return { ok: true, data: facets };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

type TermRow = {
  id: string;
  kind: TaxonomyKind;
  slug: string;
  position: number;
  taxonomy_term_translations: { locale: string; name: string }[];
};

/** The name in `locale`, else en (the fallback), else uk (required by the admin), else any. */
export function termName(rows: TermRow["taxonomy_term_translations"], locale: Locale): { name: string; locale: Locale } | null {
  const pick =
    rows.find((r) => r.locale === locale) ??
    rows.find((r) => r.locale === "en") ??
    rows.find((r) => r.locale === "uk") ??
    rows[0];
  return pick && isLocale(pick.locale) ? { name: pick.name, locale: pick.locale } : null;
}

/** Every material and colour, in the admin's order then by name, named in `locale`. */
export async function getTaxonomyTerms(locale: Locale): Promise<CatalogResult<TaxonomyTerm[]>> {
  if (!isLocale(locale)) return { ok: false, reason: "invalid" };
  try {
    const { data, error } = await createPublicServerClient()
      .from("taxonomy_terms")
      .select("id, kind, slug, position, taxonomy_term_translations(locale, name)")
      .order("position")
      .order("slug");
    if (error) return { ok: false, reason: "unexpectedError" };
    const terms = (data as TermRow[]).flatMap((row): TaxonomyTerm[] => {
      const name = termName(row.taxonomy_term_translations, locale);
      if (!name || !KINDS.includes(row.kind)) return [];
      return [{ id: row.id, kind: row.kind, slug: row.slug, position: row.position, name: name.name, nameLocale: name.locale }];
    });
    const collator = new Intl.Collator(locale);
    terms.sort((a, b) => a.position - b.position || collator.compare(a.name, b.name));
    return { ok: true, data: terms };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}
