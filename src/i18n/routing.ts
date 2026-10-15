import { defineRouting } from "next-intl/routing";

// D3: 11 locales, every URL under /<locale>/ (including /en), x-default is /en
export const locales = ["uk", "en", "de", "fr", "es", "it", "pl", "nl", "cs", "pt", "ro"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
  // detection order: URL prefix > NEXT_LOCALE cookie > Accept-Language > defaultLocale; never by IP
  localeDetection: true,
  localeCookie: { name: "NEXT_LOCALE" },
  // hreflang comes from generateMetadata (src/i18n/metadata.ts), not from a Link response header
  alternateLinks: false,
});
