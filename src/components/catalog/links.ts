import { isRouteEnabled, routes } from "@/config/routes";

// Locale-less paths of the catalog; the next-intl Link adds the locale prefix.

export const SHOP_HREF = routes.shop.path;

export const SEARCH_HREF = routes.search.path;

export function categoryHref(slug: string): string {
  return `${SHOP_HREF}/${slug}`;
}

/** The product page (task #16) by the product's slug in the current locale. */
export function productHref(slug: string): string {
  return `${routes.product.path}/${slug}`;
}

/** Until the product page exists its links are not prefetched: every prefetch would answer 404. */
export const PRODUCT_PREFETCH: false | undefined = isRouteEnabled("product") ? undefined : false;
