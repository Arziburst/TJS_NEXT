import { defaultLocale, locales, type Locale } from "@/i18n/routing";
import type {
  Category,
  Product,
  ProductImage,
  ProductSummary,
  ProductTranslation,
  TranslationSource,
} from "./types";

/** Content missing in a locale falls back to the default locale (x-default, D3). */
export const fallbackLocale: Locale = defaultLocale;

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** The requested locale and the fallback, without duplicates: the locales a query needs. */
export function localesFor(locale: Locale): Locale[] {
  return locale === fallbackLocale ? [locale] : [locale, fallbackLocale];
}

/** "29.90" (numeric(10,2) as text) -> 2990; null for anything that is not a non-negative amount. */
export function usdTextToMinor(text: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** The row in the requested locale, else the fallback locale's row, else null. */
export function pickByLocale<T extends { locale: string }>(rows: readonly T[], locale: Locale): T | null {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === fallbackLocale) ?? null;
}

export type CategoryRow = {
  id: string;
  slug: string;
  position: number;
  category_translations: { locale: string; name: string; source: TranslationSource }[];
};

export function mapCategory(row: CategoryRow, locale: Locale): Category | null {
  const t = pickByLocale(row.category_translations, locale);
  if (!t || !isLocale(t.locale)) return null;
  return { id: row.id, slug: row.slug, position: row.position, name: t.name, nameLocale: t.locale, nameSource: t.source };
}

export type TranslationRow = {
  locale: string;
  slug: string;
  title: string;
  description: string | null;
  materials: string | null;
  care: string | null;
  alt_text: string | null;
  meta_title: string | null;
  meta_description: string | null;
  source: TranslationSource;
  reviewed_at: string | null;
};

export type ImageRow = {
  id: string;
  storage_path: string;
  position: number;
  width: number;
  height: number;
  blur_data_url: string | null;
  product_image_alts: { locale: string; alt: string }[];
};

export type ProductRow = {
  id: string;
  sku: string | null;
  fulfillment: ProductSummary["fulfillment"];
  availability: ProductSummary["availability"];
  lead_time_days: number | null;
  price_usd_text: string;
  weight_g: number;
  created_at: string;
  published_at: string | null;
  category: { id: string; slug: string } | null;
  product_translations: TranslationRow[];
  product_images: ImageRow[];
};

/** Maps a storage path to its public URL (the bucket is public). */
export type PublicUrlFor = (storagePath: string) => string;

function mapTranslation(t: TranslationRow & { locale: Locale }, requested: Locale): ProductTranslation {
  return {
    locale: t.locale,
    slug: t.slug,
    title: t.title,
    description: t.description,
    metaTitle: t.meta_title,
    metaDescription: t.meta_description,
    source: t.source,
    reviewedAt: t.reviewed_at,
    isFallback: t.locale !== requested,
  };
}

/** Image alt: the image's own alt in the locale (or the fallback), else the product's alt text, else its title. */
function mapImage(row: ImageRow, locale: Locale, t: TranslationRow, publicUrlFor: PublicUrlFor): ProductImage {
  const alt = pickByLocale(row.product_image_alts, locale)?.alt ?? t.alt_text ?? t.title;
  return {
    id: row.id,
    url: publicUrlFor(row.storage_path),
    width: row.width,
    height: row.height,
    blurDataUrl: row.blur_data_url,
    alt,
  };
}

/** Null when the row cannot be shown: no translation in the locale or the fallback, or a broken price. */
export function mapProduct(row: ProductRow, locale: Locale, publicUrlFor: PublicUrlFor): Product | null {
  const t = pickByLocale(row.product_translations, locale);
  const priceUsdMinor = usdTextToMinor(row.price_usd_text);
  if (!t || !isLocale(t.locale) || priceUsdMinor === null || !row.category) return null;
  const images = [...row.product_images]
    .sort((a, b) => a.position - b.position)
    .map((img) => mapImage(img, locale, t, publicUrlFor));
  return {
    id: row.id,
    sku: row.sku,
    category: { id: row.category.id, slug: row.category.slug },
    fulfillment: row.fulfillment,
    availability: row.availability,
    leadTimeDays: row.lead_time_days,
    priceUsdMinor,
    weightG: row.weight_g,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    translation: mapTranslation({ ...t, locale: t.locale }, locale),
    images,
    materials: t.materials,
    care: t.care,
  };
}

export function toSummary(product: Product): ProductSummary {
  return {
    id: product.id,
    sku: product.sku,
    category: product.category,
    fulfillment: product.fulfillment,
    availability: product.availability,
    leadTimeDays: product.leadTimeDays,
    priceUsdMinor: product.priceUsdMinor,
    weightG: product.weightG,
    createdAt: product.createdAt,
    publishedAt: product.publishedAt,
    translation: product.translation,
    images: product.images,
  };
}
