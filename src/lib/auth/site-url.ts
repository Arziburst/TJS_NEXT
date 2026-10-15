import "server-only";

import { getMetadataBase } from "@/i18n/metadata";
import type { Locale } from "@/i18n/routing";

/**
 * Absolute URL of an auth route for links in emails and OAuth redirects. Built from the configured site URL,
 * never from the request's Host header (a forged host would otherwise end up in the email link).
 */
export function authUrl(locale: Locale, route: "confirm" | "callback", next?: string): string {
  const url = new URL(`/${locale}/auth/${route}`, getMetadataBase());
  if (next) url.searchParams.set("next", next);
  return url.toString();
}
