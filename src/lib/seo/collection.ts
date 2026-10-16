import type { Metadata } from "next";
import { routes } from "@/config/routes";
import { getPathname } from "@/i18n/navigation";
import { locales, type Locale } from "@/i18n/routing";
import { fallbackLocale } from "@/lib/catalog/mappers";
import { isIndexable, type TranslationReview } from "./indexing";

export function collectionPath(locale: Locale, slug: string): string {
  return getPathname({ href: `${routes.collections.path}/${slug}`, locale });
}

/**
 * canonical + hreflang of a collection's page (#67), as for a product (./product.ts): hreflang only for the locales
 * with an indexable translation (human, or a machine one the admin reviewed), x-default on the en page; the
 * canonical is the page of the translation shown (a page showing fallback content points at the fallback's page).
 */
export function collectionAlternates(
  translations: readonly ({ locale: Locale; slug: string } & TranslationReview)[],
  shown: { locale: Locale; slug: string },
): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const alternate of locales) {
    const translation = translations.find((t) => t.locale === alternate);
    if (translation && isIndexable(translation)) languages[alternate] = collectionPath(alternate, translation.slug);
  }
  if (languages[fallbackLocale]) languages["x-default"] = languages[fallbackLocale];
  return { canonical: collectionPath(shown.locale, shown.slug), languages };
}
