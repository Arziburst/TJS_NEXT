import { routes } from "@/config/routes";

// The admin's pages, locale-less like every registry path (the next-intl Link adds the prefix).
export const ADMIN_PRODUCTS_HREF = routes.admin.path;
export const NEW_PRODUCT_HREF = `${routes.admin.path}/products/new`;

export function editProductHref(id: string): string {
  return `${routes.admin.path}/products/${id}`;
}

/** The materials and colours of the shop's filters (#25). */
export const ADMIN_ATTRIBUTES_HREF = `${routes.admin.path}/attributes`;

/** The order list (#27): new requests first. */
export const ADMIN_ORDERS_HREF = `${routes.admin.path}/orders`;

/** One order by its public number (the owner's Telegram message, #26, links here). */
export function adminOrderHref(number: number): string {
  return `${ADMIN_ORDERS_HREF}/${number}`;
}
