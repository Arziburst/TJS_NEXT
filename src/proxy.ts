import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { rewriteUnknownCategory } from "./lib/catalog/unknown-category";
import { refreshSession } from "./lib/supabase/proxy";
import { productNotFoundOrRedirect } from "./proxy/product-not-found";

const intl = createMiddleware(routing);

// Session refresh first (it updates the request cookies the next steps forward), then the catalog rewrites
// and redirects or locale routing; the refreshed cookies are set on whichever response that returns.
export default async function proxy(request: NextRequest) {
  const applySession = await refreshSession(request);
  return applySession(
    rewriteUnknownCategory(request) ?? (await productNotFoundOrRedirect(request)) ?? intl(request),
  );
}

export const config = {
  // every path except API routes, Next.js internals, Vercel internals and files with an extension
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
