import { routes } from "@/config/routes";

// The admin's pages, locale-less like every registry path (the next-intl Link adds the prefix).
export const ADMIN_PRODUCTS_HREF = routes.admin.path;
export const NEW_PRODUCT_HREF = `${routes.admin.path}/products/new`;

export function editProductHref(id: string): string {
  return `${routes.admin.path}/products/${id}`;
}
