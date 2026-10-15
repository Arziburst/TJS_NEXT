import { hasLocale } from "next-intl";
import { NextResponse, type NextRequest } from "next/server";
import { routing, type Locale } from "@/i18n/routing";
import { PRODUCT_SLUG_PATTERN, resolveProductPath, type SlugMatch } from "@/lib/catalog/product-path";

/*
 * A product page is prerendered (or served as its static shell) before its data is read, so a notFound()
 * in the page answers 200 with an empty error shell (docs/standards.md, "Not found pages"). For document
 * requests the proxy therefore looks the slug up first: an unknown or unpublished slug is rewritten to a
 * path no route matches, which renders the localized global 404 with status 404; a slug of another locale
 * is redirected to this locale's. Client navigations (RSC) and prefetches are left to the page.
 */

const PRODUCT_PATH = /^\/([a-z]{2})\/product\/([^/]+)\/?$/;
// rewritten to: no route matches it, so src/app/global-not-found.tsx answers
const NOT_FOUND_PATH = "/_not-found-product";
// next-intl's request header for the locale, read by src/i18n/request.ts on the global 404
const LOCALE_HEADER = "X-NEXT-INTL-LOCALE";

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 500;
const LOOKUP_TIMEOUT_MS = 2_000;

// per server instance; a published or unpublished product shows up here within CACHE_TTL_MS
const lookups = new Map<string, { expires: number; matches: SlugMatch[] }>();

/** A browser or crawler loading the page itself, not an RSC fetch, a prefetch or an asset. */
export function isDocumentRequest(request: NextRequest): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const headers = request.headers;
  if (headers.has("rsc") || headers.has("next-router-prefetch") || headers.get("purpose") === "prefetch") return false;
  const dest = headers.get("sec-fetch-dest");
  return dest === null || dest === "document";
}

type RestRow = {
  product_id: string;
  locale: string;
  slug: string;
  product: { product_translations: { locale: string; slug: string }[] };
};

// Anonymous read through the Data API: RLS hides drafts, archived and deleted products. Null on any failure.
async function lookUp(slug: string): Promise<SlugMatch[] | null> {
  const now = Date.now();
  const cached = lookups.get(slug);
  if (cached && cached.expires > now) return cached.matches;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const query = new URLSearchParams({
    select: "product_id,locale,slug,product:products!inner(product_translations(locale,slug))",
    slug: `eq.${slug}`,
    "product.status": "eq.published",
    "product.deleted_at": "is.null",
  });
  try {
    const response = await fetch(`${url}/rest/v1/product_translations?${query}`, {
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as RestRow[];
    const matches = rows.map((row) => ({
      productId: row.product_id,
      locale: row.locale,
      slug: row.slug,
      productSlugs: row.product.product_translations,
    }));
    if (lookups.size >= CACHE_MAX_ENTRIES) lookups.clear();
    lookups.set(slug, { expires: now + CACHE_TTL_MS, matches });
    return matches;
  } catch {
    return null;
  }
}

/**
 * The response for a product document request whose slug is unknown (404) or belongs to another locale
 * (redirect), or null to let the request through. Fails open: when the lookup fails the page renders.
 */
export async function productNotFoundOrRedirect(request: NextRequest): Promise<NextResponse | null> {
  const match = PRODUCT_PATH.exec(request.nextUrl.pathname);
  if (!match || !isDocumentRequest(request)) return null;
  const [, locale, rawSlug] = match;
  if (!hasLocale(routing.locales, locale)) return null;

  const slug = safeDecode(rawSlug);
  if (slug === null || !PRODUCT_SLUG_PATTERN.test(slug)) return notFound(request, locale);
  const matches = await lookUp(slug);
  if (matches === null) return null;

  const resolution = resolveProductPath(matches, locale, slug);
  if (resolution.kind === "ok") return null;
  if (resolution.kind === "notFound") return notFound(request, locale);
  const target = request.nextUrl.clone();
  target.pathname = `/${locale}/product/${resolution.slug}`;
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

/** Empties the lookup cache (tests). */
export function clearProductLookups(): void {
  lookups.clear();
}
