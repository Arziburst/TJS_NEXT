import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { rewriteUnknownCategory } from "./lib/catalog/unknown-category";
import { productNotFoundOrRedirect } from "./proxy/product-not-found";

const intl = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  return rewriteUnknownCategory(request) ?? (await productNotFoundOrRedirect(request)) ?? intl(request);
}

export const config = {
  // every path except API routes, Next.js internals, Vercel internals and files with an extension
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
