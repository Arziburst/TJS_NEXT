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

export type LeadTime = { minDays: number; maxDays: number };

/** In millimetres; each one optional. */
export type ProductDimensions = { lengthMm: number | null; widthMm: number | null; heightMm: number | null };

export type ProductSummary = {
  id: string;
  sku: string | null;
  category: { id: string; slug: string };
  fulfillment: ProductFulfillment;
  availability: ProductAvailability;
  /** Made-to-order work only: how many days making it takes (a fixed time has minDays = maxDays). */
  leadTime: LeadTime | null;
  /** USD in cents (minor units); the database keeps numeric(10,2). */
  priceUsdMinor: number;
  weightG: number;
  createdAt: string;
  publishedAt: string | null;
  translation: ProductTranslation;
  images: ProductImage[];
};

/** A product page's data; its texts (`materials`, `care`, `clasp`, `leadTimeNote`) are in `translation.locale`. */
export type Product = ProductSummary & {
  materials: string | null;
  care: string | null;
  clasp: string | null;
  leadTimeNote: string | null;
  dimensions: ProductDimensions;
};

export type ProductFilters = {
  locale: Locale;
  categorySlug?: string;
  fulfillment?: ProductFulfillment;
  availability?: ProductAvailability[];
};

/** Newest first (the legacy default), or by price. */
export type ProductSort = "newest" | "price_asc" | "price_desc";

/** A search result list adds its relevance order (the default there). */
export type ListingSort = ProductSort | "relevance";

/** "in_stock": a one-of-a-kind piece still available; "made_to_order": work made after the order. */
export type AvailabilityFilter = "in_stock" | "made_to_order";

export type TaxonomyKind = Enums["taxonomy_kind"];

/**
 * The filters of a listing as the database takes them (public.shop_search): canonical (sorted, no
 * duplicates), so that one combination is one cache entry. Prices in US cents.
 */
export type ListingFilters = {
  locale: Locale;
  categorySlug: string | null;
  /** Search words (src/lib/search/query.ts); empty for a plain listing. */
  terms: string[];
  materials: string[];
  colours: string[];
  priceMinUsdMinor: number | null;
  priceMaxUsdMinor: number | null;
  availability: AvailabilityFilter[];
};

/** A material or a colour, named in the requested locale (or the fallback en, else uk). */
export type TaxonomyTerm = {
  id: string;
  kind: TaxonomyKind;
  slug: string;
  position: number;
  name: string;
  nameLocale: Locale;
};

/** Products per filter option, each counted with every other filter applied; options without products are absent. */
export type Facets = {
  material: Record<string, number>;
  colour: Record<string, number>;
  availability: Partial<Record<AvailabilityFilter, number>>;
};

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
