import { routes } from "@/config/routes";

// Locale-less paths of the checkout; the next-intl Link and router add the locale prefix.

export const ORDER_REQUEST_HREF = routes.orderRequest.path;

/** The confirmation page of order `number` (it opens only for the visitor who placed the order). */
export function orderDoneHref(number: number): string {
  return `${routes.orderRequestDone.path}?order=${number}`;
}
