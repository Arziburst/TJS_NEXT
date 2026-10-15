import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { rewriteUnknownCategory } from "./lib/catalog/unknown-category";

const intl = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  return rewriteUnknownCategory(request) ?? intl(request);
}

export const config = {
  // every path except API routes, Next.js internals, Vercel internals and files with an extension
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
