import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { productNotFoundOrRedirect } from "./proxy/product-not-found";

const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  return (await productNotFoundOrRedirect(request)) ?? handleI18nRouting(request);
}

export const config = {
  // every path except API routes, Next.js internals, Vercel internals and files with an extension
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
