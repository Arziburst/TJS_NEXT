import "server-only";

import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getCachedCategories } from "@/lib/catalog/cache";
import { CATEGORY_SLUGS, type CategorySlug } from "@/lib/catalog/categories";

export type CategoryEntry = {
  slug: CategorySlug;
  name: string;
  /** Null when the database could not be read; the name then comes from the messages. */
  id: string | null;
};

/** The six categories in the legacy order, named from the database, else from the catalog messages. */
export async function getCategoryEntries(locale: Locale): Promise<CategoryEntry[]> {
  const [result, t] = await Promise.all([
    getCachedCategories(locale),
    getTranslations({ locale, namespace: "catalog.categories" }),
  ]);
  const bySlug = new Map(result.ok ? result.data.map((c) => [c.slug, c]) : []);
  return CATEGORY_SLUGS.map((slug) => {
    const category = bySlug.get(slug);
    return { slug, name: category?.name ?? t(slug), id: category?.id ?? null };
  });
}
