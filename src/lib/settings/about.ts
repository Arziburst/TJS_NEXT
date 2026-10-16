import { locales, type Locale } from "@/i18n/routing";

/*
 * Which About text a locale shows (pure). The owner writes uk (required to publish) and any other locale; a
 * locale without its own text falls back to en, then uk, and is not indexed. A machine translation (#19) is
 * shown but not indexed until a person has reviewed it.
 */

export type TranslationSource = "human" | "machine";

export type AboutTranslation = {
  locale: Locale;
  bodyHtml: string;
  metaDescription: string | null;
  source: TranslationSource;
  reviewedAt: string | null;
};

export type AboutContent = { published: boolean; translations: AboutTranslation[] };

/** The editor lists uk first (required to publish), then en (the first fallback), then the rest. */
export const ABOUT_EDITOR_LOCALES: readonly Locale[] = ["uk", "en", ...locales.filter((l) => l !== "uk" && l !== "en")];
export const ABOUT_PUBLISH_LOCALE: Locale = "uk";
const FALLBACK_LOCALES: readonly Locale[] = ["en", "uk"];

export type AboutView = {
  translation: AboutTranslation;
  // the text is another locale's (shown in its own language, lang attribute set)
  isFallback: boolean;
  indexable: boolean;
};

function reviewed(translation: AboutTranslation): boolean {
  return translation.source === "human" || translation.reviewedAt !== null;
}

/** The text `locale` shows, or null while the page is unpublished (the page then shows its TBD note). */
export function aboutView(content: AboutContent | null, locale: Locale): AboutView | null {
  if (!content?.published) return null;
  const own = content.translations.find((t) => t.locale === locale);
  if (own) return { translation: own, isFallback: false, indexable: reviewed(own) };
  for (const fallback of FALLBACK_LOCALES) {
    const translation = content.translations.find((t) => t.locale === fallback);
    if (translation) return { translation, isFallback: true, indexable: false };
  }
  return null;
}

/** The locales whose page is indexed: hreflang lists exactly these. */
export function indexedAboutLocales(content: AboutContent | null): Locale[] {
  if (!content?.published) return [];
  return locales.filter((locale) => aboutView(content, locale)?.indexable);
}
