import { hasLocale } from "next-intl";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { safeNextPath } from "@/lib/auth/schemas";
import { createSessionClient } from "@/lib/supabase/server";
import { redirectTo } from "../redirect";

// Google (OAuth) comes back here with a code; exchanging it needs the PKCE verifier cookie set when the
// sign-in started, so the round trip stays on one origin (NEXT_PUBLIC_SITE_URL).
export async function GET(request: NextRequest, { params }: RouteContext<"/[locale]/auth/callback">) {
  const { locale: requested } = await params;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const code = request.nextUrl.searchParams.get("code");
  const safeNext = safeNextPath(request.nextUrl.searchParams.get("next")) ?? `/${locale}`;

  if (code) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirectTo(safeNext);
  }
  return redirectTo(`/${locale}/sign-in-and-up?error=oauthFailed`);
}
