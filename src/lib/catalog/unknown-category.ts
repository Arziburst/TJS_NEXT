import { NextResponse, type NextRequest } from "next/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { isCategorySlug } from "./categories";

const CATEGORY_PATH = /^\/([^/]+)\/shop\/([^/]+)\/?$/;

/**
 * /<locale>/shop/<unknown slug> must answer a crawler-visible 404 (docs/standards.md, "Not found pages"):
 * a notFound() in the prerendered category route is served as 200 with an empty error shell. The proxy
 * rewrites such a URL to a path no route matches, which renders src/app/global-not-found.tsx per request
 * in the locale passed on in next-intl's request header. Null for every other URL.
 */
export function rewriteUnknownCategory(request: NextRequest): NextResponse | null {
  const match = CATEGORY_PATH.exec(request.nextUrl.pathname);
  if (!match) return null;
  const [, locale, slug] = match;
  // the six slugs are plain ASCII, so the raw segment is compared without decoding
  if (!hasLocale(routing.locales, locale) || isCategorySlug(slug)) return null;

  const headers = new Headers(request.headers);
  headers.set("X-NEXT-INTL-LOCALE", locale);
  return NextResponse.rewrite(new URL(`/${locale}/shop/${slug}/not-found`, request.url), { request: { headers } });
}
