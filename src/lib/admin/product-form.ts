import { z } from "zod";
import { locales, type Locale } from "@/i18n/routing";
import { SLUG_MAX_LENGTH, SLUG_PATTERN, slugify } from "./slug";

/*
 * The product form's fields and their validation, shared by the form (field names, limits) and the server
 * action (the only place the input is trusted after parsing). Pure: no database access here.
 */

/** The translations editor lists uk first (required to publish), then en (the fallback), then the rest. */
export const EDITOR_LOCALES: readonly Locale[] = ["uk", "en", ...locales.filter((l) => l !== "uk" && l !== "en")];
export const PUBLISH_LOCALE: Locale = "uk";

export const TRANSLATION_FIELDS = [
  "title",
  "slug",
  "description",
  "materials",
  "care",
  "clasp",
  "leadTimeNote",
  "metaTitle",
  "metaDescription",
] as const;
export type TranslationField = (typeof TRANSLATION_FIELDS)[number];

// technical limits (column sanity, not business values): long enough for any real text
export const TEXT_LIMITS: Record<TranslationField, number> = {
  title: 200,
  slug: SLUG_MAX_LENGTH,
  description: 5000,
  materials: 500,
  care: 500,
  clasp: 200,
  leadTimeNote: 500,
  metaTitle: 200,
  metaDescription: 500,
};
export const SKU_MAX_LENGTH = 64;
/** A photo's alt text per locale: a short description. */
export const IMAGE_ALT_MAX_LENGTH = 300;
export const LEAD_TIME_MAX_DAYS = 365;
// numeric(10,2) for the price, numeric(6,1) for the dimensions
const PRICE_MAX = 99_999_999.99;
const DIMENSION_MAX = 99_999.9;
const WEIGHT_MAX = 100_000;
const POSITION_LIMIT = 1_000_000;

export const STATUSES = ["draft", "published", "archived"] as const;
export const FULFILLMENTS = ["made_to_order", "one_of_a_kind"] as const;
export const AVAILABILITIES = ["available", "reserved", "sold"] as const;

export type ProductStatus = (typeof STATUSES)[number];

export type FieldErrorCode =
  | "required"
  | "tooLong"
  | "invalidNumber"
  | "outOfRange"
  | "invalidSlug"
  | "slugTaken"
  | "skuTaken"
  | "leadTimeOrder"
  | "titleRequired"
  | "requiredToPublish"
  // a product with sizes (#66): it stays made to order, and every size keeps a price above zero
  | "hasVariants"
  | "variantPriceNotPositive";

export type FieldErrors = Partial<Record<string, FieldErrorCode>>;

/** The form field name of a translation field: `tr.uk.title`. */
export function translationFieldName(locale: Locale, field: TranslationField): string {
  return `tr.${locale}.${field}`;
}

export type TranslationInput = {
  locale: Locale;
  slug: string;
  title: string;
  description: string | null;
  materials: string | null;
  care: string | null;
  clasp: string | null;
  lead_time_note: string | null;
  meta_title: string | null;
  meta_description: string | null;
};

/** What admin_save_product takes; amounts stay decimal strings so no float touches a price. */
export type ProductInput = {
  id: string | null;
  product: {
    category_id: string;
    sku: string | null;
    status: ProductStatus;
    fulfillment: (typeof FULFILLMENTS)[number];
    availability: (typeof AVAILABILITIES)[number];
    lead_time_min_days: number | null;
    lead_time_max_days: number | null;
    price_usd: string;
    weight_g: string;
    length_mm: string | null;
    width_mm: string | null;
    height_mm: string | null;
    position: number;
  };
  translations: TranslationInput[];
};

export type ParseResult = { ok: true; input: ProductInput } | { ok: false; fields: FieldErrors };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .transform((v) => (v === "" ? null : v));

/** A non-negative decimal with up to `scale` places, as text ("29.9" -> "29.90" is left to Postgres). */
const decimal = (scale: number, { min, max, exclusiveMin }: { min: number; max: number; exclusiveMin: boolean }) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .pipe(
      z
        .string()
        .regex(new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`), "invalidNumber")
        .refine((v) => {
          const n = Number(v);
          return (exclusiveMin ? n > min : n >= min) && n <= max;
        }, "outOfRange"),
    );

const optionalDecimal = (scale: number, max: number) =>
  z.union([z.literal("").transform(() => null), decimal(scale, { min: 0, max, exclusiveMin: true })]);

const days = z.union([
  z.literal("").transform(() => null),
  z
    .string()
    .regex(/^\d+$/, "invalidNumber")
    .transform(Number)
    .refine((n) => n >= 1 && n <= LEAD_TIME_MAX_DAYS, "outOfRange"),
]);

const productSchema = z.object({
  id: z.union([z.literal("").transform(() => null), z.uuid()]),
  categoryId: z.uuid("required"),
  sku: optionalText(SKU_MAX_LENGTH),
  status: z.enum(STATUSES, "required"),
  fulfillment: z.enum(FULFILLMENTS, "required"),
  // only a one-of-a-kind piece has the field; made-to-order work is always available
  availability: z.union([z.literal("").transform(() => "available" as const), z.enum(AVAILABILITIES, "required")]),
  priceUsd: z.string().trim().min(1, "required").pipe(decimal(2, { min: 0, max: PRICE_MAX, exclusiveMin: true })),
  weightG: z.string().trim().min(1, "required").pipe(decimal(2, { min: 0, max: WEIGHT_MAX, exclusiveMin: false })),
  leadTimeMin: days,
  leadTimeMax: days,
  lengthMm: optionalDecimal(1, DIMENSION_MAX),
  widthMm: optionalDecimal(1, DIMENSION_MAX),
  heightMm: optionalDecimal(1, DIMENSION_MAX),
  position: z.union([
    z.literal("").transform(() => 0),
    z
      .string()
      .regex(/^-?\d+$/, "invalidNumber")
      .transform(Number)
      .refine((n) => Math.abs(n) <= POSITION_LIMIT, "outOfRange"),
  ]),
});

const translationSchema = z.object(
  Object.fromEntries(TRANSLATION_FIELDS.map((f) => [f, optionalText(TEXT_LIMITS[f])])) as Record<
    TranslationField,
    ReturnType<typeof optionalText>
  >,
);

function value(values: Record<string, string | undefined>, name: string): string {
  return values[name] ?? "";
}

function collect(errors: FieldErrors, prefix: string, error: z.ZodError) {
  for (const issue of error.issues) {
    const name = `${prefix}${String(issue.path[0])}`;
    if (errors[name]) continue;
    errors[name] = (KNOWN_CODES as readonly string[]).includes(issue.message)
      ? (issue.message as FieldErrorCode)
      : "required";
  }
}

const KNOWN_CODES = [
  "required",
  "tooLong",
  "invalidNumber",
  "outOfRange",
  "invalidSlug",
  "leadTimeOrder",
] as const satisfies readonly FieldErrorCode[];

/**
 * Parses the submitted form. A locale counts as translated when its title is set; any other text without a
 * title is an error, a missing slug is generated from the title. The lead time and its note belong to
 * made-to-order work, the availability to a one-of-a-kind piece; the other kind's values are dropped.
 */
export function parseProductForm(values: Record<string, string | undefined>): ParseResult {
  const errors: FieldErrors = {};
  const raw = Object.fromEntries(Object.keys(productSchema.shape).map((k) => [k, value(values, k)]));
  const product = productSchema.safeParse(raw);
  if (!product.success) collect(errors, "", product.error);

  const translations: TranslationInput[] = [];
  for (const locale of EDITOR_LOCALES) {
    const prefix = `tr.${locale}.`;
    const parsed = translationSchema.safeParse(
      Object.fromEntries(TRANSLATION_FIELDS.map((f) => [f, value(values, prefix + f)])),
    );
    if (!parsed.success) {
      collect(errors, prefix, parsed.error);
      continue;
    }
    const t = parsed.data;
    if (t.title === null) {
      const filled = TRANSLATION_FIELDS.some((f) => f !== "slug" && t[f] !== null);
      if (filled) errors[prefix + "title"] = "titleRequired";
      continue;
    }
    const slug = t.slug ?? slugify(t.title);
    if (!SLUG_PATTERN.test(slug)) {
      errors[prefix + "slug"] = "invalidSlug";
      continue;
    }
    translations.push({
      locale,
      slug,
      title: t.title,
      description: t.description,
      materials: t.materials,
      care: t.care,
      clasp: t.clasp,
      lead_time_note: t.leadTimeNote,
      meta_title: t.metaTitle,
      meta_description: t.metaDescription,
    });
  }

  if (!product.success) return { ok: false, fields: errors };
  const p = product.data;
  const madeToOrder = p.fulfillment === "made_to_order";

  // one bound given: a fixed time
  const min = madeToOrder ? (p.leadTimeMin ?? p.leadTimeMax) : null;
  const max = madeToOrder ? (p.leadTimeMax ?? p.leadTimeMin) : null;
  if (min !== null && max !== null && min > max) errors.leadTimeMax = "leadTimeOrder";

  if (p.status === "published" && !translations.some((t) => t.locale === PUBLISH_LOCALE)) {
    errors[`tr.${PUBLISH_LOCALE}.title`] ??= "requiredToPublish";
  }
  if (Object.keys(errors).length > 0) return { ok: false, fields: errors };

  return {
    ok: true,
    input: {
      id: p.id,
      product: {
        category_id: p.categoryId,
        sku: p.sku,
        status: p.status,
        fulfillment: p.fulfillment,
        availability: madeToOrder ? "available" : p.availability,
        lead_time_min_days: min,
        lead_time_max_days: max,
        price_usd: p.priceUsd,
        weight_g: p.weightG,
        length_mm: p.lengthMm,
        width_mm: p.widthMm,
        height_mm: p.heightMm,
        position: p.position,
      },
      translations: translations.map((t) => (madeToOrder ? t : { ...t, lead_time_note: null })),
    },
  };
}
