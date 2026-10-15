import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { refreshSession } from "./lib/supabase/proxy";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

// Session refresh first (it updates the request cookies the locale middleware forwards), then locale
// routing; the refreshed cookies are set on whatever response the locale middleware returns.
export default async function proxy(request: NextRequest) {
  const applySession = await refreshSession(request);
  return applySession(intl(request));
}

export const config = {
  // every path except API routes, Next.js internals, Vercel internals and files with an extension
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
