import { z } from "zod";
import { DELIVERY_COUNTRIES } from "@/lib/delivery/nova-post/countries";
import { ADMIN_ORDER_STATUSES, type AdminOrderStatus } from "./order-status";

// The order list's filters as they travel in the URL (?status=new&from=2026-10-01&to=…&country=UA&q=…&page=2):
// read from the search params with a value that does not parse simply left out, and written back into the
// links of the pages. Shared by the page and its tests; no "server-only" here.

/** Where orders go (D2): Ukraine, the EU member states and Switzerland. */
export const ORDER_COUNTRIES = ["UA", ...DELIVERY_COUNTRIES] as const;

export const ORDER_SEARCH_MAX_LENGTH = 100;
export const ADMIN_ORDERS_PAGE_SIZE = 20;

export type AdminOrderFilters = {
  status?: AdminOrderStatus;
  dateFrom?: string;
  dateTo?: string;
  country?: string;
  query?: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

const isoDate = z.iso.date();

function single(value: string | string[] | undefined): string | undefined {
  const text = typeof value === "string" ? value.trim() : undefined;
  return text ? text : undefined;
}

export function parseOrderFilters(params: SearchParams): { filters: AdminOrderFilters; page: number } {
  const status = single(params.status);
  const dateFrom = single(params.from);
  const dateTo = single(params.to);
  const country = single(params.country);
  const query = single(params.q);
  const page = Number(single(params.page) ?? "1");

  const filters: AdminOrderFilters = {};
  if (status && (ADMIN_ORDER_STATUSES as readonly string[]).includes(status)) filters.status = status as AdminOrderStatus;
  if (dateFrom && isoDate.safeParse(dateFrom).success) filters.dateFrom = dateFrom;
  if (dateTo && isoDate.safeParse(dateTo).success) filters.dateTo = dateTo;
  if (country && (ORDER_COUNTRIES as readonly string[]).includes(country)) filters.country = country;
  if (query) filters.query = query.slice(0, ORDER_SEARCH_MAX_LENGTH);
  return { filters, page: Number.isSafeInteger(page) && page >= 1 ? page : 1 };
}

export function hasOrderFilters(filters: AdminOrderFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

/** The search params of `filters` (and a page after the first), in a stable order. */
export function orderFilterParams(filters: AdminOrderFilters, page = 1): Record<string, string | undefined> {
  return {
    status: filters.status,
    from: filters.dateFrom,
    to: filters.dateTo,
    country: filters.country,
    q: filters.query,
    page: page > 1 ? String(page) : undefined,
  };
}
