import type { Metadata } from "next";
import { locales, type Locale } from "@/i18n/routing";

// Open Graph names a locale as language_TERRITORY: each language in the territory of its main market (D2, D5)
export const OG_LOCALES: Record<Locale, string> = {
  uk: "uk_UA",
  en: "en_US",
  de: "de_DE",
  fr: "fr_FR",
  es: "es_ES",
  it: "it_IT",
  pl: "pl_PL",
  nl: "nl_NL",
  cs: "cs_CZ",
  pt: "pt_PT",
  ro: "ro_RO",
};

/** The width and height of every generated share image: the size Open Graph and X large cards expect. */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export type PageOpenGraphInput = {
  locale: Locale;
  /** Root-relative URL of the page in `locale` (its canonical); resolved against metadataBase. */
  url: string;
  title: string;
  description: string;
  siteName: string;
};

/**
 * Open Graph of a page of the shop itself (home, listing, category): written in every locale, so all the
 * others are its og:locale:alternate. The image comes from the segment's opengraph-image file.
 */
export function pageOpenGraph({ locale, url, title, description, siteName }: PageOpenGraphInput): NonNullable<Metadata["openGraph"]> {
  return {
    type: "website",
    siteName,
    url,
    title,
    description,
    locale: OG_LOCALES[locale],
    alternateLocale: locales.filter((l) => l !== locale).map((l) => OG_LOCALES[l]),
  };
}
