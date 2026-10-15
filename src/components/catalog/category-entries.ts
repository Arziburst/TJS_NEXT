import "server-only";

import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { CATEGORY_SLUGS, type CategorySlug } from "@/lib/catalog/categories";

export type CategoryEntry = { slug: CategorySlug; name: string };

/*
 * The six categories in the legacy order, named from the catalog messages. Static on purpose: with Next
 * 16.4.1, a "use cache" read in the shell of /<locale> or /<locale>/shop left the client router's
 * `/_tree` prefetch of those routes open once the visitor had a cookie (TJS_CURRENCY), so a page linking
 * to them never reached network idle. The product listing itself stays cached data.
 */
export async function getCategoryEntries(locale: Locale): Promise<CategoryEntry[]> {
  const t = await getTranslations({ locale, namespace: "catalog.categories" });
  return CATEGORY_SLUGS.map((slug) => ({ slug, name: t(slug) }));
}
