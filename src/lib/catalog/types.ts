import type { Database } from "@/lib/supabase/database.types";
import type { Locale } from "@/i18n/routing";

type Enums = Database["public"]["Enums"];

export type ProductFulfillment = Enums["product_fulfillment"];
export type ProductAvailability = Enums["product_availability"];
export type TranslationSource = Enums["translation_source"];

export type Category = {
  id: string;
  slug: string;
  position: number;
  name: string;
  /** The locale `name` is in: the requested one, or `en` when that translation is missing. */
  nameLocale: Locale;
  nameSource: TranslationSource;
};

export type ProductTranslation = {
  /** The requested locale, or `en` when the product has no translation in it (`isFallback`). */
  locale: Locale;
  slug: string;
  title: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  source: TranslationSource;
  reviewedAt: string | null;
  isFallback: boolean;
};

export type ProductImage = {
  id: string;
  url: string;
  width: number;
  height: number;
  blurDataUrl: string | null;
  alt: string;
};

export type ProductSummary = {
  id: string;
  category: { id: string; slug: string };
  fulfillment: ProductFulfillment;
  availability: ProductAvailability;
  leadTimeDays: number | null;
  /** USD in cents (minor units); the database keeps numeric(10,2). */
  priceUsdMinor: number;
  weightG: number;
  createdAt: string;
  publishedAt: string | null;
  translation: ProductTranslation;
  images: ProductImage[];
};

/** A product page's data; `materials` and `care` are in `translation.locale`, like the other texts. */
export type Product = ProductSummary & {
  materials: string | null;
  care: string | null;
};

export type ProductFilters = {
  locale: Locale;
  categorySlug?: string;
  fulfillment?: ProductFulfillment;
  availability?: ProductAvailability[];
};

/** Newest first (the legacy default), or by price. */
export type ProductSort = "newest" | "price_asc" | "price_desc";

export type PageRequest = { page: number; pageSize: number };

export type ProductPage = {
  items: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type CatalogResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "invalid" | "notFound" | "unexpectedError" };
