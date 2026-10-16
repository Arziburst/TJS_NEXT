import type { Locale } from "@/i18n/routing";
import type { TranslationContent, TranslationParts } from "./core";

/*
 * What a translation run writes, per target locale and per item (#102): the product's texts (one row per locale,
 * with its own source flag), each photo's alt and each size's name. Without "replace", a run fills only what a
 * locale lacks, so a size added to a translated product gets its name in every language and nothing written
 * stays touched. Pure and free of runtime imports: the server plans the run with it, the admin panel counts the
 * languages its button offers with the very same rule.
 */

/** The locales each item of a product has: its text rows, its photos' alts, its live sizes' names. */
export type TranslationHoldings = {
  texts: readonly string[];
  images: readonly { id: string; locales: readonly string[] }[];
  variants: readonly { id: string; locales: readonly string[] }[];
};

/** What one target locale gets: the product's texts (a whole row) and/or the alts and size names it lacks. */
export type LocaleNeed = { texts: boolean; imageIds: string[]; variantIds: string[] };

/**
 * Per target, what the run writes: with `overwrite` everything the source has, else only the items the target
 * lacks. A product row the target already has stays as it is (its own source flag covers the whole row). A target
 * that lacks nothing is left out; the source never is a target.
 */
export function planNeeds({
  holdings,
  sourceLocale,
  candidates,
  overwrite,
}: {
  holdings: TranslationHoldings;
  sourceLocale: Locale;
  candidates: readonly Locale[];
  overwrite: boolean;
}): Partial<Record<Locale, LocaleNeed>> {
  const needs: Partial<Record<Locale, LocaleNeed>> = {};
  if (!holdings.texts.includes(sourceLocale)) return needs;
  const lacking = (items: TranslationHoldings["images" | "variants"], locale: Locale) =>
    items
      .filter((item) => item.locales.includes(sourceLocale) && (overwrite || !item.locales.includes(locale)))
      .map((item) => item.id);

  for (const locale of candidates) {
    if (locale === sourceLocale) continue;
    const need: LocaleNeed = {
      texts: overwrite || !holdings.texts.includes(locale),
      imageIds: lacking(holdings.images, locale),
      variantIds: lacking(holdings.variants, locale),
    };
    if (need.texts || need.imageIds.length > 0 || need.variantIds.length > 0) needs[locale] = need;
  }
  return needs;
}

/**
 * The call's content and each target's part of it: `source` cut to what some target needs (so the model reads
 * nothing it is not asked to translate), and per target only its own items.
 */
export function partsOf(
  source: TranslationContent,
  needs: Partial<Record<Locale, LocaleNeed>>,
): { content: TranslationContent; parts: TranslationParts } {
  const cut = (need: LocaleNeed): TranslationContent => {
    const texts = need.texts
      ? source.texts
      : (Object.fromEntries(Object.keys(source.texts).map((field) => [field, null])) as TranslationContent["texts"]);
    const variantLabels = (source.variantLabels ?? []).filter((size) => need.variantIds.includes(size.variantId));
    return {
      texts,
      imageAlts: source.imageAlts.filter((image) => need.imageIds.includes(image.imageId)),
      ...(variantLabels.length > 0 ? { variantLabels } : {}),
    };
  };
  const all = Object.values(needs);
  const content = cut({
    texts: all.some((need) => need.texts),
    imageIds: all.flatMap((need) => need.imageIds),
    variantIds: all.flatMap((need) => need.variantIds),
  });
  const parts = Object.fromEntries(
    Object.entries(needs).map(([locale, need]) => [locale, cut(need)]),
  ) as TranslationParts;
  return { content, parts };
}
