import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { Locale } from "@/i18n/routing";
import { FAILED_READ_LIFE } from "@/lib/failed-read";
import { createPublicServerClient } from "@/lib/supabase/server";
import { collectionTag } from "./cache";
import {
  COLLECTION_SLUG_PATTERN,
  collectionLocalesFor,
  collectionSlugFor,
  pickCollectionTranslation,
  resolveCollectionPath,
  type CollectionSlugMatch,
} from "./collection-path";
import { PRODUCT_IMAGES_BUCKET } from "./index";
import { isLocale } from "./mappers";
import type { CatalogResult, TranslationSource } from "./types";

/*
 * The storefront's collections (#67), read as `anon`: RLS shows published collections only. Cached for every
 * visitor; tagged COLLECTIONS_TAG (any collection change), collectionTag(id) (one collection) and, for a page,
 * collectionSlugTag(slug), so the admin's writes expire them.
 */
export const COLLECTIONS_TAG = "collections";

export function collectionSlugTag(slug: string): string {
  return `collection-slug:${slug}`;
}

export type CollectionCover = { url: string; width: number; height: number; blurDataUrl: string | null };

export type CollectionEntry = {
  id: string;
  /** The URL slug in the requested locale (or the fallback's). */
  slug: string;
  name: string;
  /** The locale of `name` and `slug`: the requested one, else en, else uk. */
  locale: Locale;
  cover: CollectionCover | null;
};

/** A collection's translation as its hreflang alternates need it. */
export type CollectionAlternate = { locale: Locale; slug: string; source: TranslationSource; reviewedAt: string | null };

export type Collection = CollectionEntry & {
  description: string | null;
  source: TranslationSource;
  reviewedAt: string | null;
  isFallback: boolean;
  translations: CollectionAlternate[];
};

type TranslationRow = {
  locale: string;
  slug: string;
  name: string;
  description: string | null;
  source: TranslationSource;
  reviewed_at: string | null;
};

type CollectionRow = {
  id: string;
  cover_storage_path: string | null;
  cover_width: number | null;
  cover_height: number | null;
  cover_blur_data_url: string | null;
  collection_translations: TranslationRow[];
};

const COLLECTION_COLUMNS =
  "id, cover_storage_path, cover_width, cover_height, cover_blur_data_url, collection_translations(locale, slug, name, description, source, reviewed_at)";

function coverOf(row: CollectionRow, urlFor: (path: string) => string): CollectionCover | null {
  if (!row.cover_storage_path || !row.cover_width || !row.cover_height) return null;
  return { url: urlFor(row.cover_storage_path), width: row.cover_width, height: row.cover_height, blurDataUrl: row.cover_blur_data_url };
}

export function mapCollection(row: CollectionRow, locale: Locale, urlFor: (path: string) => string): Collection | null {
  const t = pickCollectionTranslation(row.collection_translations, locale);
  if (!t || !isLocale(t.locale)) return null;
  return {
    id: row.id,
    slug: t.slug,
    name: t.name,
    locale: t.locale,
    cover: coverOf(row, urlFor),
    description: t.description,
    source: t.source,
    reviewedAt: t.reviewed_at,
    isFallback: t.locale !== locale,
    translations: row.collection_translations.flatMap((r) =>
      isLocale(r.locale) ? [{ locale: r.locale, slug: r.slug, source: r.source, reviewedAt: r.reviewed_at }] : [],
    ),
  };
}

function client() {
  const supabase = createPublicServerClient();
  const urlFor = (path: string) => supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
  return { supabase, urlFor };
}

/** The published collections in the owner's order, named in `locale` (else en, else uk). */
export async function getCollections(locale: Locale): Promise<CatalogResult<Collection[]>> {
  if (!isLocale(locale)) return { ok: false, reason: "invalid" };
  try {
    const { supabase, urlFor } = client();
    const { data, error } = await supabase
      .from("collections")
      .select(COLLECTION_COLUMNS)
      .eq("is_published", true)
      .order("position")
      .order("published_at");
    if (error) return { ok: false, reason: "unexpectedError" };
    return { ok: true, data: data.flatMap((row) => mapCollection(row, locale, urlFor) ?? []) };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

/** The collection lists of the home page and the shop's navigation; an empty list when there are none. */
export async function getCachedCollections(locale: Locale): Promise<CatalogResult<CollectionEntry[]>> {
  "use cache";
  cacheTag(COLLECTIONS_TAG);
  const result = await getCollections(locale);
  // a route shell's entry: no stale window (daysNoSwr, docs/standards.md §3)
  if (result.ok) cacheLife("daysNoSwr");
  else cacheLife(FAILED_READ_LIFE);
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(({ id, slug, name, locale: l, cover }) => ({ id, slug, name, locale: l, cover })) };
}

/** Every published collection that has a translation with `slug`, with all its translations' slugs. */
export async function findCollectionSlugMatches(slug: string): Promise<CatalogResult<CollectionSlugMatch[]>> {
  if (!COLLECTION_SLUG_PATTERN.test(slug)) return { ok: false, reason: "invalid" };
  try {
    const { data, error } = await createPublicServerClient()
      .from("collection_translations")
      .select("collection_id, locale, slug, collection:collections!inner(collection_translations(locale, slug))")
      .eq("slug", slug)
      .eq("collection.is_published", true);
    if (error) return { ok: false, reason: "unexpectedError" };
    return {
      ok: true,
      data: data.map((row) => ({
        collectionId: row.collection_id,
        locale: row.locale,
        slug: row.slug,
        collectionSlugs: row.collection.collection_translations,
      })),
    };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

// a build without a reachable database gives up at once (as getProductSlugs)
const BUILD_READ_TIMEOUT_MS = 5_000;

/** The URL slug in `locale` of every published collection. */
export async function getCollectionSlugs(locale: Locale): Promise<CatalogResult<string[]>> {
  if (!isLocale(locale)) return { ok: false, reason: "invalid" };
  try {
    const { data, error } = await createPublicServerClient()
      .from("collections")
      .select("id, collection_translations!inner(locale, slug)")
      .eq("is_published", true)
      .in("collection_translations.locale", collectionLocalesFor(locale))
      .order("id")
      .retry(false)
      .abortSignal(AbortSignal.timeout(BUILD_READ_TIMEOUT_MS));
    if (error) return { ok: false, reason: "unexpectedError" };
    return { ok: true, data: data.flatMap((row) => collectionSlugFor(row.collection_translations, locale) ?? []) };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

export type CollectionPageData =
  | { kind: "ok"; collection: Collection }
  | { kind: "redirect"; slug: string }
  | { kind: "notFound" }
  | { kind: "unexpectedError" };

/** What /<locale>/collections/<slug> shows above its listing, cached for every visitor. */
export async function getCollectionPage(locale: Locale, slug: string): Promise<CollectionPageData> {
  "use cache";
  if (!isLocale(locale) || !COLLECTION_SLUG_PATTERN.test(slug)) {
    cacheLife("max");
    return { kind: "notFound" };
  }
  cacheTag(COLLECTIONS_TAG);
  cacheTag(collectionSlugTag(slug));

  const matches = await findCollectionSlugMatches(slug);
  if (!matches.ok) return failed();
  for (const match of matches.data) cacheTag(collectionTag(match.collectionId));
  const resolution = resolveCollectionPath(matches.data, locale, slug);
  if (resolution.kind === "notFound") {
    cacheLife("minutes");
    return resolution;
  }
  if (resolution.kind === "redirect") {
    cacheLife("days");
    return { kind: "redirect", slug: resolution.slug };
  }

  try {
    const { supabase, urlFor } = client();
    const { data, error } = await supabase
      .from("collections")
      .select(COLLECTION_COLUMNS)
      .eq("id", resolution.collectionId)
      .eq("is_published", true)
      .maybeSingle();
    if (error) return failed();
    const collection = data ? mapCollection(data, locale, urlFor) : null;
    if (!collection) {
      cacheLife("minutes");
      return { kind: "notFound" };
    }
    // the collection route's shell: no stale window, as the product page
    cacheLife("daysNoSwr");
    return { kind: "ok", collection };
  } catch {
    return failed();
  }
}

function failed(): CollectionPageData {
  cacheLife(FAILED_READ_LIFE);
  return { kind: "unexpectedError" };
}
