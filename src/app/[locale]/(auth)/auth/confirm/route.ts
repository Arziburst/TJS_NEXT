import type { EmailOtpType } from "@supabase/supabase-js";
import { hasLocale } from "next-intl";
import type { NextRequest } from "next/server";
import { routes } from "@/config/routes";
import { routing } from "@/i18n/routing";
import { createSessionClient } from "@/lib/supabase/server";
import { redirectTo } from "../redirect";

const TYPES: readonly EmailOtpType[] = ["email", "signup", "recovery", "email_change"];

// Where each link continues. An email change (#28) is confirmed from both addresses: the account page says
// whether the other link is still to be followed, or shows the new email.
const NEXT_PAGE: Partial<Record<EmailOtpType, string>> = {
  recovery: routes.updatePassword.path,
  email_change: routes.account.path,
};

// The link in the confirmation, password-reset and email change emails (supabase/templates): verifies the token
// hash on the server, which signs the user in, then continues to the home page, to choosing a new password or to
// the account.
export async function GET(request: NextRequest, { params }: RouteContext<"/[locale]/auth/confirm">) {
  const { locale: requested } = await params;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return redirectTo(`/${locale}${NEXT_PAGE[type] ?? ""}`);
  }
  return redirectTo(`/${locale}/sign-in-and-up?error=linkInvalid`);
}
