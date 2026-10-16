import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { supportedAcceptLanguage } from "./i18n/accept-language";
import { routing } from "./i18n/routing";
import { rewriteUnknownCategory } from "./lib/catalog/unknown-category";
import { legacyRedirect } from "./lib/redirects/proxy";
import { securePageRequest } from "./lib/security/proxy";
import { refreshSession } from "./lib/supabase/proxy";
import { collectionNotFoundOrRedirect } from "./proxy/collection-not-found";
import { productNotFoundOrRedirect } from "./proxy/product-not-found";

const intl = createMiddleware(routing);

// D27: next-intl negotiates only among the browser languages we serve, so any other one lands on /en
function withSupportedLanguages(request: NextRequest): NextRequest {
  const supported = supportedAcceptLanguage(request.headers.get("accept-language"));
  if (supported) request.headers.set("accept-language", supported);
  else request.headers.delete("accept-language");
  return request;
}

// The request id and the report-only policy's nonce first (the next steps forward the request headers), then
// the session refresh (it updates the request cookies), then the legacy shop's URLs, the catalog rewrites and
// redirects or locale routing; the refreshed cookies and the security headers are set on whichever response
// that returns.
export default async function proxy(request: NextRequest) {
  const applySecurity = securePageRequest(request);
  const applySession = await refreshSession(request);
  return applySecurity(
    applySession(
      (await legacyRedirect(request)) ??
        rewriteUnknownCategory(request) ??
        (await productNotFoundOrRedirect(request)) ??
        (await collectionNotFoundOrRedirect(request)) ??
        intl(withSupportedLanguages(request)),
    ),
  );
}

export const config = {
  // every path except API routes, Next.js internals, Vercel internals and files with an extension
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
