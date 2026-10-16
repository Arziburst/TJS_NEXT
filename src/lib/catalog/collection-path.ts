import { locales, type Locale } from "@/i18n/routing";
import { fallbackLocale } from "./mappers";

/*
 * Which collection a /<locale>/collections/<slug> URL means (#67), shared by the proxy (document requests answer
 * 404 or redirect before rendering) and the page (client navigations). Pure: no database access here. A collection
 * the owner named only in Ukrainian (publishing needs uk) is still shown everywhere: its text falls back from the
 * locale to en, then to uk.
 */

export const COLLECTION_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type CollectionSlug = { locale: string; slug: string };

/** A translation whose slug is the requested one, with every translation of its (published) collection. */
export type CollectionSlugMatch = CollectionSlug & { collectionId: string; collectionSlugs: CollectionSlug[] };

export type CollectionPathResolution =
  | { kind: "ok"; collectionId: string }
  | { kind: "redirect"; collectionId: string; slug: string }
  | { kind: "notFound" };

/** The locales whose text a page in `locale` shows, best first. */
export function collectionLocalesFor(locale: Locale): Locale[] {
  return [...new Set<Locale>([locale, fallbackLocale, "uk"])];
}

/** The translation a page in `locale` shows: its own, else en, else uk. */
export function pickCollectionTranslation<T extends { locale: string }>(rows: readonly T[], locale: Locale): T | null {
  for (const l of collectionLocalesFor(locale)) {
    const row = rows.find((r) => r.locale === l);
    if (row) return row;
  }
  return null;
}

/** The one URL slug a collection has in `locale`. */
export function collectionSlugFor(slugs: readonly CollectionSlug[], locale: Locale): string | null {
  return pickCollectionTranslation(slugs, locale)?.slug ?? null;
}

/**
 * A slug of the locale wins, then the fallbacks', then any other locale's (a URL kept from a locale switch). The URL
 * is canonical when its slug is the collection's slug for `locale`; otherwise it redirects there.
 */
export function resolveCollectionPath(matches: readonly CollectionSlugMatch[], locale: Locale, slug: string): CollectionPathResolution {
  if (!COLLECTION_SLUG_PATTERN.test(slug)) return { kind: "notFound" };
  const preferred = collectionLocalesFor(locale) as readonly string[];
  const rank = (m: CollectionSlugMatch) => {
    const i = preferred.indexOf(m.locale);
    return i >= 0 ? i : preferred.length + (locales as readonly string[]).indexOf(m.locale);
  };
  const match = matches
    .filter((m) => m.slug === slug)
    .toSorted((a, b) => rank(a) - rank(b))
    .find((m) => collectionSlugFor(m.collectionSlugs, locale) !== null);
  if (!match) return { kind: "notFound" };
  const canonical = collectionSlugFor(match.collectionSlugs, locale)!;
  return canonical === slug
    ? { kind: "ok", collectionId: match.collectionId }
    : { kind: "redirect", collectionId: match.collectionId, slug: canonical };
}
