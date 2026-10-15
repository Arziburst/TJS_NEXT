import "server-only";

import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { CATEGORY_SLUGS, type CategorySlug } from "@/lib/catalog/categories";

export type CategoryEntry = { slug: CategorySlug; name: string };

/*
 * The six categories in the legacy order, named from the catalog messages. Static on purpose: a cached
 * read in the shell of /<locale> or /<locale>/shop would give those routes a stale window, which the
 * browser serves its prefetches from (docs/standards.md §3, "No stale window in a prerendered route
 * shell"). The product listing itself stays cached data.
 */
export async function getCategoryEntries(locale: Locale): Promise<CategoryEntry[]> {
  const t = await getTranslations({ locale, namespace: "catalog.categories" });
  return CATEGORY_SLUGS.map((slug) => ({ slug, name: t(slug) }));
}
