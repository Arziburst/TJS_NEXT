import { routes } from "@/config/routes";

// Locale-less paths of the account; the next-intl Link and router add the locale prefix.

export const ACCOUNT_HREF = routes.account.path;
export const ACCOUNT_ORDERS_HREF = routes.accountOrders.path;
export const ACCOUNT_ADDRESSES_HREF = routes.accountAddresses.path;

/** One order of the customer's history. */
export function accountOrderHref(number: number): string {
  return `${routes.accountOrders.path}/${number}`;
}

/** A page of the order history; the first page has no query. */
export function accountOrdersPageHref(page: number): string {
  return page > 1 ? `${routes.accountOrders.path}?page=${page}` : routes.accountOrders.path;
}
