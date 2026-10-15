import "server-only";

import { getAdmin } from "@/lib/auth/session";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/catalog";
import { isLocale, usdTextToMinor } from "@/lib/catalog/mappers";
import { createServiceClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import type { Database } from "@/lib/supabase/database.types";
import {
  EDITOR_LOCALES,
  STATUSES,
  type ProductStatus,
  type TranslationField,
  type TranslationInput,
} from "./product-form";

/*
 * The admin's reads. Every product but the soft-deleted ones, drafts and archived included, with the internal
 * columns the API roles cannot read (deleted_at, created_by, updated_by): so they go through the service-role
 * client, and every function checks the admin itself first (a page has called requireAdmin() already; a
 * second check costs nothing, the user is read once per request).
 */

type Enums = Database["public"]["Enums"];
export type AdminResult<T> = { ok: true; data: T } | { ok: false; reason: "notAuthorized" | "notFound" | "unexpectedError" };

export type AdminImage = { id: string; url: string; width: number; height: number };

export type AdminProductListItem = {
  id: string;
  sku: string | null;
  categoryId: string;
  status: ProductStatus;
  fulfillment: Enums["product_fulfillment"];
  availability: Enums["product_availability"];
  priceUsdMinor: number | null;
  /** The title in the admin's locale, else the first translated one (uk, en, …), else null. */
  title: { text: string; locale: Locale } | null;
  /** Locales without a translation, in the editor's order; uk first when it is missing. */
  missingLocales: Locale[];
  image: AdminImage | null;
  updatedAt: string;
};

export type AdminProductFilters = { locale: Locale; query?: string; categoryId?: string; status?: ProductStatus };

export type AdminTranslation = Record<Exclude<TranslationField, "title" | "slug">, string | null> & {
  locale: Locale;
  title: string;
  slug: string;
  source: Enums["translation_source"];
  reviewedAt: string | null;
};

export type AdminProduct = {
  id: string;
  categoryId: string;
  sku: string | null;
  status: ProductStatus;
  fulfillment: Enums["product_fulfillment"];
  availability: Enums["product_availability"];
  leadTimeMinDays: number | null;
  leadTimeMaxDays: number | null;
  priceUsd: string;
  weightG: string;
  lengthMm: string | null;
  widthMm: string | null;
  heightMm: string | null;
  position: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  translations: AdminTranslation[];
  images: AdminImage[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// a shop made by one person: every product fits one list
const LIST_LIMIT = 1000;

function imageUrl(client: ReturnType<typeof createServiceClient>, path: string): string {
  return client.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}

function titleFor(translations: { locale: string; title: string }[], locale: Locale): AdminProductListItem["title"] {
  const pick =
    translations.find((t) => t.locale === locale) ??
    EDITOR_LOCALES.map((l) => translations.find((t) => t.locale === l)).find((t) => t !== undefined);
  return pick && isLocale(pick.locale) ? { text: pick.title, locale: pick.locale } : null;
}

function matches(item: { sku: string | null; translations: { title: string }[] }, query: string): boolean {
  const needle = query.toLocaleLowerCase();
  return (
    (item.sku?.toLocaleLowerCase().includes(needle) ?? false) ||
    item.translations.some((t) => t.title.toLocaleLowerCase().includes(needle))
  );
}

/** Every product that is not deleted, newest first; search by title (any locale) or SKU. */
export async function listAdminProducts(filters: AdminProductFilters): Promise<AdminResult<AdminProductListItem[]>> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  if (filters.categoryId !== undefined && !UUID.test(filters.categoryId)) return { ok: true, data: [] };
  if (filters.status !== undefined && !STATUSES.includes(filters.status)) return { ok: true, data: [] };
  try {
    const client = createServiceClient();
    let query = client
      .from("products")
      .select(
        `id, sku, category_id, status, fulfillment, availability, price_usd_text:price_usd::text, updated_at,
         product_translations(locale, title),
         product_images(id, storage_path, position, width, height)`,
      )
      .is("deleted_at", null);
    if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
    if (filters.status) query = query.eq("status", filters.status);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id")
      .order("position", { referencedTable: "product_images" })
      .limit(1, { referencedTable: "product_images" })
      .limit(LIST_LIMIT);
    if (error) return { ok: false, reason: "unexpectedError" };

    const query_ = filters.query?.trim();
    const items = data
      .map((row) => ({ row, translations: row.product_translations }))
      .filter(({ row, translations }) => !query_ || matches({ sku: row.sku, translations }, query_))
      .map(({ row, translations }): AdminProductListItem => {
        const image = row.product_images[0];
        const translated = new Set(translations.map((t) => t.locale));
        return {
          id: row.id,
          sku: row.sku,
          categoryId: row.category_id,
          status: row.status,
          fulfillment: row.fulfillment,
          availability: row.availability,
          priceUsdMinor: usdTextToMinor(row.price_usd_text),
          title: titleFor(translations, filters.locale),
          missingLocales: EDITOR_LOCALES.filter((l) => !translated.has(l)),
          image: image
            ? { id: image.id, url: imageUrl(client, image.storage_path), width: image.width, height: image.height }
            : null,
          updatedAt: row.updated_at,
        };
      });
    return { ok: true, data: items };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

/** One product that is not deleted, with all its translations and its images, for the edit form. */
export async function getAdminProduct(id: string): Promise<AdminResult<AdminProduct>> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  if (!UUID.test(id)) return { ok: false, reason: "notFound" };
  try {
    const client = createServiceClient();
    const { data, error } = await client
      .from("products")
      .select(
        `id, category_id, sku, status, fulfillment, availability, lead_time_min_days, lead_time_max_days,
         price_usd_text:price_usd::text, weight_g_text:weight_g::text, length_mm_text:length_mm::text,
         width_mm_text:width_mm::text, height_mm_text:height_mm::text, position, published_at, created_at, updated_at,
         product_translations(locale, title, slug, description, materials, care, clasp, lead_time_note,
           meta_title, meta_description, source, reviewed_at),
         product_images(id, storage_path, position, width, height)`,
      )
      .eq("id", id)
      .is("deleted_at", null)
      .order("position", { referencedTable: "product_images" })
      .maybeSingle();
    if (error) return { ok: false, reason: "unexpectedError" };
    if (!data) return { ok: false, reason: "notFound" };

    const translations = data.product_translations
      .filter((t): t is typeof t & { locale: Locale } => isLocale(t.locale))
      .map(
        (t): AdminTranslation => ({
          locale: t.locale,
          title: t.title,
          slug: t.slug,
          description: t.description,
          materials: t.materials,
          care: t.care,
          clasp: t.clasp,
          leadTimeNote: t.lead_time_note,
          metaTitle: t.meta_title,
          metaDescription: t.meta_description,
          source: t.source,
          reviewedAt: t.reviewed_at,
        }),
      )
      .toSorted((a, b) => EDITOR_LOCALES.indexOf(a.locale) - EDITOR_LOCALES.indexOf(b.locale));

    return {
      ok: true,
      data: {
        id: data.id,
        categoryId: data.category_id,
        sku: data.sku,
        status: data.status,
        fulfillment: data.fulfillment,
        availability: data.availability,
        leadTimeMinDays: data.lead_time_min_days,
        leadTimeMaxDays: data.lead_time_max_days,
        priceUsd: data.price_usd_text,
        weightG: data.weight_g_text,
        lengthMm: data.length_mm_text,
        widthMm: data.width_mm_text,
        heightMm: data.height_mm_text,
        position: data.position,
        publishedAt: data.published_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        translations,
        images: data.product_images.map((image) => ({
          id: image.id,
          url: imageUrl(client, image.storage_path),
          width: image.width,
          height: image.height,
        })),
      },
    };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

export type SaveConflicts = { slugs: { locale: Locale; slug: string }[]; skuTaken: boolean };

/**
 * Slugs and the SKU another product already uses (deleted ones too: the unique keys keep them), so the form
 * names the conflicting field instead of a generic failure.
 */
export async function findSaveConflicts(
  id: string | null,
  sku: string | null,
  slugs: { locale: Locale; slug: string }[],
): Promise<SaveConflicts | null> {
  try {
    const client = createServiceClient();
    const [translations, products] = await Promise.all([
      slugs.length === 0
        ? Promise.resolve({ data: [], error: null })
        : client
            .from("product_translations")
            .select("product_id, locale, slug")
            .in("slug", slugs.map((s) => s.slug)),
      sku === null
        ? Promise.resolve({ data: [], error: null })
        : client.from("products").select("id").eq("sku", sku),
    ]);
    if (translations.error || products.error) return null;
    const taken = translations.data.filter(
      (row) => row.product_id !== id && slugs.some((s) => s.locale === row.locale && s.slug === row.slug),
    );
    return {
      slugs: taken.filter((row) => isLocale(row.locale)).map((row) => ({ locale: row.locale as Locale, slug: row.slug })),
      skuTaken: products.data.some((row) => row.id !== id),
    };
  } catch {
    return null;
  }
}

export type StoredTranslation = Omit<TranslationInput, "locale"> & { locale: string; source: Enums["translation_source"] };

/**
 * A product as stored before a save: its category and slugs (what the save must revalidate on the
 * storefront) and its translations (an unchanged machine translation keeps its source). Null when unreadable.
 */
export async function getStoredProduct(
  id: string,
): Promise<{ categoryId: string; translations: StoredTranslation[] } | "notFound" | null> {
  try {
    const { data, error } = await createServiceClient()
      .from("products")
      .select(
        `category_id, product_translations(locale, slug, title, description, materials, care, clasp, lead_time_note,
         meta_title, meta_description, source)`,
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return null;
    if (!data) return "notFound";
    return { categoryId: data.category_id, translations: data.product_translations };
  } catch {
    return null;
  }
}

/** The source of a saved translation: an edited text is the admin's own (human), an unchanged one keeps its source. */
export function sourceAfterSave(input: TranslationInput, stored: StoredTranslation | undefined): Enums["translation_source"] {
  if (!stored) return "human";
  const keys = [
    "slug",
    "title",
    "description",
    "materials",
    "care",
    "clasp",
    "lead_time_note",
    "meta_title",
    "meta_description",
  ] as const satisfies readonly (keyof TranslationInput)[];
  return keys.every((key) => input[key] === stored[key]) ? stored.source : "human";
}
