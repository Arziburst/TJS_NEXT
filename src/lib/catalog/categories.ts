/**
 * The six category slugs of D9 in the legacy order: the reference data of migration
 * 20261016001202_catalog_categories.sql. Static so routing (generateStaticParams, the 404 for an unknown
 * slug) needs no database; tests/catalog/categories.integration.test.ts keeps it equal to the table.
 */
export const CATEGORY_SLUGS = ["earrings", "necklaces", "bracelets", "corals", "rings", "brooches"] as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export function isCategorySlug(value: string): value is CategorySlug {
  return (CATEGORY_SLUGS as readonly string[]).includes(value);
}

/** D9: a product carries the "new" badge for 7 days after its creation. */
export const NEW_BADGE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isNewProduct(createdAt: string, now: number): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now - created < NEW_BADGE_DAYS * DAY_MS;
}
