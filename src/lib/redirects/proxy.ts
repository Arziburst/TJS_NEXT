// Used by src/proxy.ts only (no "server-only": the proxy bundle is not built with the react-server condition).
import { NextResponse, type NextRequest } from "next/server";
import { productSlugFor } from "@/lib/catalog/product-path";
import { LOCALE_COOKIE, legacyTarget, visitorLocale } from "./legacy";
import { findLegacyProduct } from "./legacy-product";

/**
 * A 308 from a legacy shop URL to its page in the visitor's locale (#31), or null for any other URL. A legacy
 * product id that is unknown, unpublished or cannot be looked up right now lands on the shop: never a 404 or a
 * 500 for a link that worked on the old site. The query string is kept, as next-intl keeps it when it adds a locale.
 */
export async function legacyRedirect(request: NextRequest): Promise<NextResponse | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const target = legacyTarget(request.nextUrl.pathname);
  if (!target) return null;

  const locale = visitorLocale(request.cookies.get(LOCALE_COOKIE)?.value, request.headers.get("accept-language"));
  let path = target.kind === "path" ? target.path : "/shop";
  if (target.kind === "product") {
    const product = await findLegacyProduct(target.legacyId);
    if (product && target.management) path = `/admin/products/${product.id}`;
    else if (product) {
      // the product's one URL in this locale (src/lib/catalog/product-path.ts): no second redirect after this one
      const slug = productSlugFor(product.slugs, locale);
      if (slug) path = `/product/${encodeURIComponent(slug)}`;
    }
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${path}`;
  return NextResponse.redirect(url, 308);
}
