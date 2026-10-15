// Locale-less paths of the catalog; the next-intl Link adds the locale prefix.

export const SHOP_HREF = "/shop";

export function categoryHref(slug: string): string {
  return `${SHOP_HREF}/${slug}`;
}

/** The product page (task #16) by the product's slug in the current locale. */
export function productHref(slug: string): string {
  return `/product/${slug}`;
}
