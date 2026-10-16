import type { AvailabilityFilter, ListingSort } from "@/lib/catalog/types";
import { isCurrency, type Currency } from "@/lib/money/currencies";
import { normalizeQuery } from "@/lib/search/query";

/** Legacy page size of the catalog. */
export const PAGE_SIZE = 20;
/** "Show more" keeps at most this many pages on screen; older ones drop off the top. */
export const MAX_PAGES_SHOWN = 10;

/** The `sort` values of the URL; the default order of a listing (newest, or relevance for search) is left out. */
const SORT_PARAMS = {
  newest: "newest",
  "price-asc": "price_asc",
  "price-desc": "price_desc",
  relevance: "relevance",
  featured: "position",
} as const satisfies Record<string, ListingSort>;

export type SortParam = keyof typeof SORT_PARAMS;

/**
 * The shop's listings, the search results or a collection's page (#67): the same view, the search adds the query
 * and its relevance order, a collection its owner's order.
 */
export type ListingContext = "shop" | "search" | "collection";

/**
 * The listing state, all of it in the URL (shareable, survives a reload):
 * `?sort=price-asc&page=3&from=2` shows pages 2 to 3 sorted by price; "show more" raises `page`.
 */
export type ShopQuery = { sort: ListingSort; from: number; page: number };

export type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInt(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d{0,5}$/.test(value)) return null;
  return Number(value);
}

export function defaultSortOf(context: ListingContext): ListingSort {
  return context === "search" ? "relevance" : context === "collection" ? "position" : "newest";
}

/** The orders a listing offers: relevance only for search results, the owner's order only for a collection. */
export function sortsOf(context: ListingContext): readonly ListingSort[] {
  if (context === "search") return ["relevance", "newest", "price_asc", "price_desc"];
  if (context === "collection") return ["position", "newest", "price_asc", "price_desc"];
  return ["newest", "price_asc", "price_desc"];
}

/** Unknown or malformed values fall back to the defaults instead of failing the page. */
export function parseShopQuery(params: SearchParams, context: ListingContext = "shop"): ShopQuery {
  const value = single(params.sort);
  const parsed = value !== undefined && Object.hasOwn(SORT_PARAMS, value) ? SORT_PARAMS[value as SortParam] : undefined;
  const sort = parsed !== undefined && sortsOf(context).includes(parsed) ? parsed : defaultSortOf(context);
  const page = positiveInt(single(params.page)) ?? 1;
  const requestedFrom = positiveInt(single(params.from)) ?? page;
  const from = Math.min(Math.max(requestedFrom, page - MAX_PAGES_SHOWN + 1), page);
  return { sort, from, page };
}

export function sortParam(sort: ListingSort): SortParam | undefined {
  return (Object.keys(SORT_PARAMS) as SortParam[]).find((key) => SORT_PARAMS[key] === sort);
}

/** The query string object of a state; defaults are left out so every state has one URL. */
export function toQuery({ sort, from, page }: ShopQuery, context: ListingContext = "shop"): Record<string, string> {
  const query: Record<string, string> = {};
  const s = sort === defaultSortOf(context) ? undefined : sortParam(sort);
  if (s) query.sort = s;
  if (page > 1) query.page = String(page);
  if (from !== page) query.from = String(from);
  return query;
}

// Filters ---------------------------------------------------------------------------------------------------

const AVAILABILITY_PARAMS = { "in-stock": "in_stock", "made-to-order": "made_to_order" } as const satisfies Record<
  string,
  AvailabilityFilter
>;

export type AvailabilityParam = keyof typeof AVAILABILITY_PARAMS;

export const AVAILABILITY_FILTERS: readonly AvailabilityFilter[] = ["in_stock", "made_to_order"];

export function availabilityParam(filter: AvailabilityFilter): AvailabilityParam {
  return (Object.keys(AVAILABILITY_PARAMS) as AvailabilityParam[]).find((key) => AVAILABILITY_PARAMS[key] === filter)!;
}

/**
 * A price range as typed, in major units of `currency` ("1289", "29.90"); either bound may be open. The
 * currency is the one the range was set in (the visitor's display currency then), so a shared link means
 * the same range for a visitor who sees another currency (the currency itself stays a cookie, D5).
 */
export type PriceFilter = { min: string | null; max: string | null; currency: Currency | null };

/**
 * The filters of a listing: materials and colours by their slugs (a product passes with any of them), the
 * availability (in stock, made to order) and the price range. Canonical: sorted, without duplicates.
 */
export type ShopFilters = {
  materials: string[];
  colours: string[];
  availability: AvailabilityFilter[];
  price: PriceFilter;
};

export const NO_FILTERS: ShopFilters = {
  materials: [],
  colours: [],
  availability: [],
  price: { min: null, max: null, currency: null },
};

const TERM_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** More values than any list holds in practice; a longer URL is cut, never refused. */
export const MAX_FILTER_VALUES = 20;
const AMOUNT = /^\d{1,9}(?:[.,]\d{1,2})?$/;

/** `?material=a,b`, `?material=a&material=b` or both: the valid slugs, sorted, once each. */
function slugList(value: string | string[] | undefined): string[] {
  const parts = (Array.isArray(value) ? value : value === undefined ? [] : [value]).flatMap((v) => v.split(","));
  const slugs = new Set(parts.map((p) => p.trim()).filter((p) => p.length <= 80 && TERM_SLUG.test(p)));
  return [...slugs].sort().slice(0, MAX_FILTER_VALUES);
}

function amount(value: string | undefined): string | null {
  const text = value?.trim();
  return text !== undefined && AMOUNT.test(text) ? text.replace(",", ".") : null;
}

export function parseShopFilters(params: SearchParams): ShopFilters {
  const availability = slugList(params.availability)
    .filter((v): v is AvailabilityParam => Object.hasOwn(AVAILABILITY_PARAMS, v))
    .map((v) => AVAILABILITY_PARAMS[v]);
  const min = amount(single(params.min));
  const max = amount(single(params.max));
  const currency = single(params.cur)?.toUpperCase();
  return {
    materials: slugList(params.material),
    colours: slugList(params.colour),
    availability: AVAILABILITY_FILTERS.filter((f) => availability.includes(f)),
    price: {
      min,
      max,
      currency: (min !== null || max !== null) && isCurrency(currency) ? currency : null,
    },
  };
}

/** The query string object of the filters; empty filters are left out. */
export function filtersQuery(filters: ShopFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.materials.length > 0) query.material = [...filters.materials].sort().join(",");
  if (filters.colours.length > 0) query.colour = [...filters.colours].sort().join(",");
  if (filters.price.min !== null) query.min = filters.price.min;
  if (filters.price.max !== null) query.max = filters.price.max;
  if ((filters.price.min !== null || filters.price.max !== null) && filters.price.currency !== null) {
    query.cur = filters.price.currency;
  }
  if (filters.availability.length > 0) {
    query.availability = AVAILABILITY_FILTERS.filter((f) => filters.availability.includes(f)).map(availabilityParam).join(",");
  }
  return query;
}

/** How many filters are set (a price range counts once): the number on the mobile filter button. */
export function activeFilterCount(filters: ShopFilters): number {
  const price = filters.price.min !== null || filters.price.max !== null ? 1 : 0;
  return filters.materials.length + filters.colours.length + filters.availability.length + price;
}

// The whole state -------------------------------------------------------------------------------------------

/** Everything the URL of a listing says: the search query (search only), the filters, sort and pages. */
export type ListingState = { context: ListingContext; q: string; query: ShopQuery; filters: ShopFilters };

export function parseListingState(params: SearchParams, context: ListingContext): ListingState {
  return {
    context,
    q: context === "search" ? normalizeQuery(single(params.q)) : "",
    query: parseShopQuery(params, context),
    filters: parseShopFilters(params),
  };
}

/** The query string object of a state: `q`, the filters, then sort and pages; defaults left out. */
export function listingQuery({ context, q, query, filters }: ListingState): Record<string, string> {
  return { ...(q !== "" ? { q } : {}), ...filtersQuery(filters), ...toQuery(query, context) };
}

/** The same listing from its first page (a changed sort or filter starts again at the top). */
export function firstPage(state: ListingState, changes: Partial<Pick<ListingState, "query" | "filters">> = {}): ListingState {
  return { ...state, ...changes, query: { ...(changes.query ?? state.query), from: 1, page: 1 } };
}

/** Pager entries: the first and last page, two neighbours of `current`, and gaps between them. */
export function pagerItems(current: number, totalPages: number): (number | "gap")[] {
  const items: (number | "gap")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - current) <= 2) items.push(p);
    else if (items.at(-1) !== "gap") items.push("gap");
  }
  return items;
}

export function totalPagesFor(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
