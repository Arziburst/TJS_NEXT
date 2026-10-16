import { routes } from "@/config/routes";

// The admin's pages, locale-less like every registry path (the next-intl Link adds the prefix).
export const ADMIN_PRODUCTS_HREF = routes.admin.path;
export const NEW_PRODUCT_HREF = `${routes.admin.path}/products/new`;

export function editProductHref(id: string): string {
  return `${routes.admin.path}/products/${id}`;
}

/** The materials and colours of the shop's filters (#25). */
export const ADMIN_ATTRIBUTES_HREF = `${routes.admin.path}/attributes`;

/** The collections (#67). */
export const ADMIN_COLLECTIONS_HREF = `${routes.admin.path}/collections`;
export const NEW_COLLECTION_HREF = `${routes.admin.path}/collections/new`;

export function editCollectionHref(id: string): string {
  return `${routes.admin.path}/collections/${id}`;
}
