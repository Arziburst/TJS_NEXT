import { locales, type Locale } from "@/i18n/routing";
import { fallbackLocale } from "./mappers";

/*
 * Which product a /<locale>/product/<slug> URL means, shared by the proxy (document requests answer 404 or
 * redirect before rendering) and the page (client navigations). Pure: no database access here.
 */

export const PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type TranslationSlug = { locale: string; slug: string };

/** A translation whose slug is the requested one, with every translation of its (published) product. */
export type SlugMatch = TranslationSlug & { productId: string; productSlugs: TranslationSlug[] };

export type ProductPathResolution =
  | { kind: "ok"; productId: string }
  | { kind: "redirect"; productId: string; slug: string }
  | { kind: "notFound" };

/**
 * The slug of `locale`, else of the fallback locale: the one URL a product has in `locale`. The page then
 * shows the fallback content when the product is not translated into `locale`.
 */
export function productSlugFor(productSlugs: readonly TranslationSlug[], locale: Locale): string | null {
  return (
    productSlugs.find((t) => t.locale === locale)?.slug ??
    productSlugs.find((t) => t.locale === fallbackLocale)?.slug ??
    null
  );
}

/**
 * A slug of the locale wins, then one of the fallback locale, then any other locale's (a URL kept from a
 * locale switch). The URL is canonical when its slug is the product's slug for `locale`; otherwise it
 * redirects there.
 */
export function resolveProductPath(matches: readonly SlugMatch[], locale: Locale, slug: string): ProductPathResolution {
  if (!PRODUCT_SLUG_PATTERN.test(slug)) return { kind: "notFound" };
  const rank = (m: SlugMatch) =>
    m.locale === locale ? 0 : m.locale === fallbackLocale ? 1 : 2 + (locales as readonly string[]).indexOf(m.locale);
  const match = matches
    .filter((m) => m.slug === slug)
    .toSorted((a, b) => rank(a) - rank(b))
    .find((m) => productSlugFor(m.productSlugs, locale) !== null);
  if (!match) return { kind: "notFound" };

  const canonical = productSlugFor(match.productSlugs, locale)!;
  return canonical === slug
    ? { kind: "ok", productId: match.productId }
    : { kind: "redirect", productId: match.productId, slug: canonical };
}
