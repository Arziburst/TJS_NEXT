import { hasLocale } from "next-intl";
import { NextResponse, type NextRequest } from "next/server";
import { locales, routing, type Locale } from "@/i18n/routing";
import { COLLECTION_SLUG_PATTERN, resolveCollectionPath, type CollectionSlugMatch } from "@/lib/catalog/collection-path";
import { isDocumentRequest } from "./product-not-found";

/*
 * A collection's page (#67) is prerendered (or served as its static shell) before its data is read, like a product
 * page: for document requests the proxy looks the slug up first, rewrites an unknown or unpublished one to a path no
 * route matches (the localized global 404, status 404) and redirects a slug of another locale to this locale's
 * (src/proxy/product-not-found.ts explains why). Client navigations and prefetches are left to the page.
 */

const COLLECTION_PATH = /^\/([a-z]{2})\/collections\/([^/]+)\/?$/;
const NOT_FOUND_PATH = "/_not-found-collection";
const LOCALE_HEADER = "X-NEXT-INTL-LOCALE";

const LOOKUP_TIMEOUT_MS = 2_000;

type RestRow = {
  collection_id: string;
  locale: string;
  slug: string;
  collection: { collection_translations: { locale: string; slug: string }[] };
};

// Anonymous read through the Data API: RLS hides unpublished collections. Null on any failure. Not cached (#74), like
// the product lookup: one query per collection document request, through the unique (locale, slug) index.
async function lookUp(slug: string): Promise<CollectionSlugMatch[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const query = new URLSearchParams({
    select: "collection_id,locale,slug,collection:collections!inner(collection_translations(locale,slug))",
    locale: `in.(${locales.join(",")})`,
    slug: `eq.${slug}`,
    "collection.is_published": "eq.true",
  });
  try {
    const response = await fetch(`${url}/rest/v1/collection_translations?${query}`, {
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as RestRow[];
    return rows.map((row) => ({
      collectionId: row.collection_id,
      locale: row.locale,
      slug: row.slug,
      collectionSlugs: row.collection.collection_translations,
    }));
  } catch {
    return null;
  }
}

/**
 * The response for a collection document request whose slug is unknown (404) or belongs to another locale
 * (redirect), or null to let the request through. Fails open: when the lookup fails the page renders.
 */
export async function collectionNotFoundOrRedirect(request: NextRequest): Promise<NextResponse | null> {
  const match = COLLECTION_PATH.exec(request.nextUrl.pathname);
  if (!match || !isDocumentRequest(request)) return null;
  const [, locale, rawSlug] = match;
  if (!hasLocale(routing.locales, locale)) return null;

  const slug = safeDecode(rawSlug);
  if (slug === null || !COLLECTION_SLUG_PATTERN.test(slug)) return notFound(request, locale);
  const matches = await lookUp(slug);
  if (matches === null) return null;

  const resolution = resolveCollectionPath(matches, locale, slug);
  if (resolution.kind === "ok") return null;
  if (resolution.kind === "notFound") return notFound(request, locale);
  const target = request.nextUrl.clone();
  target.pathname = `/${locale}/collections/${resolution.slug}`;
  return NextResponse.redirect(target, 308);
}

function notFound(request: NextRequest, locale: Locale): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, locale);
  const target = request.nextUrl.clone();
  target.pathname = `/${locale}${NOT_FOUND_PATH}`;
  return NextResponse.rewrite(target, { request: { headers } });
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}