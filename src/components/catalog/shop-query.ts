import type { ProductSort } from "@/lib/catalog/types";

/** Legacy page size of the catalog. */
export const PAGE_SIZE = 20;
/** "Show more" keeps at most this many pages on screen; older ones drop off the top. */
export const MAX_PAGES_SHOWN = 10;

/** The `sort` values of the URL; newest first is the default and is left out of the URL. */
const SORT_PARAMS = { "price-asc": "price_asc", "price-desc": "price_desc" } as const satisfies Record<string, ProductSort>;

export type SortParam = keyof typeof SORT_PARAMS;

/**
 * The listing state, all of it in the URL (shareable, survives a reload):
 * `?sort=price-asc&page=3&from=2` shows pages 2 to 3 sorted by price; "show more" raises `page`.
 */
export type ShopQuery = { sort: ProductSort; from: number; page: number };

export type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInt(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d{0,5}$/.test(value)) return null;
  return Number(value);
}

/** Unknown or malformed values fall back to the defaults instead of failing the page. */
export function parseShopQuery(params: SearchParams): ShopQuery {
  const sortParam = single(params.sort);
  const sort: ProductSort = sortParam && Object.hasOwn(SORT_PARAMS, sortParam) ? SORT_PARAMS[sortParam as SortParam] : "newest";
  const page = positiveInt(single(params.page)) ?? 1;
  const requestedFrom = positiveInt(single(params.from)) ?? page;
  const from = Math.min(Math.max(requestedFrom, page - MAX_PAGES_SHOWN + 1), page);
  return { sort, from, page };
}

export function sortParam(sort: ProductSort): SortParam | undefined {
  return (Object.keys(SORT_PARAMS) as SortParam[]).find((key) => SORT_PARAMS[key] === sort);
}

/** The query string object of a state; defaults are left out so every state has one URL. */
export function toQuery({ sort, from, page }: ShopQuery): Record<string, string> {
  const query: Record<string, string> = {};
  const s = sortParam(sort);
  if (s) query.sort = s;
  if (page > 1) query.page = String(page);
  if (from !== page) query.from = String(from);
  return query;
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
