import "server-only";

import type { LanguageModel } from "ai";
import type { Locale } from "@/i18n/routing";
import { EDITOR_LOCALES } from "@/lib/admin/product-form";
import { SLUG_MAX_LENGTH, slugify } from "@/lib/admin/slug";
import { isLocale } from "@/lib/catalog/mappers";
import { createServiceClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import {
  pickSourceLocale,
  planTargets,
  slugCandidate,
  TRANSLATABLE_FIELDS,
  translateContent,
  uniqueSlug,
  type LocaleFailure,
  type TranslatableField,
  type TranslateFailure,
  type TranslationContent,
} from "./core";
import { GLOSSARY, GLOSSARY_RULES } from "./glossary";

/*
 * One product's machine translation, from its stored texts to its saved rows. Reads through the service role
 * (drafts and their texts, like every admin read), writes through the `writer` the caller passes: the admin's
 * session client, so RLS and the audit trigger see the admin. Machine rows are saved with source = machine and
 * reviewed_at = null: shown in the shop, kept out of search engines until reviewed (src/lib/seo/indexing.ts).
 */

type TextColumn =
  | "title"
  | "description"
  | "materials"
  | "care"
  | "clasp"
  | "lead_time_note"
  | "meta_title"
  | "meta_description"
  | "alt_text";

/** The column of a field: leadTimeNote -> lead_time_note. */
function columnOf(field: TranslatableField): TextColumn {
  return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`) as TextColumn;
}

type TranslationRow = { locale: string; slug: string; source: string; title: string } & Record<TextColumn, string | null>;

type StoredTexts = {
  categoryId: string;
  translations: TranslationRow[];
  images: { id: string; alts: { locale: string; alt: string }[] }[];
  /** The live sizes (#66) in the owner's order, with their names. */
  variants: { id: string; labels: { locale: string; label: string }[] }[];
};

async function readTexts(productId: string): Promise<StoredTexts | "notFound" | null> {
  try {
    const { data, error } = await createServiceClient()
      .from("products")
      .select(
        `category_id,
         product_translations(locale, slug, source, title, description, materials, care, clasp, lead_time_note,
           meta_title, meta_description, alt_text),
         product_images(id, position, product_image_alts(locale, alt)),
         product_variants(id, position, deleted_at, product_variant_translations(locale, label))`,
      )
      .eq("id", productId)
      .is("deleted_at", null)
      .order("position", { referencedTable: "product_images" })
      .order("position", { referencedTable: "product_variants" })
      .maybeSingle();
    if (error) return null;
    if (!data) return "notFound";
    return {
      categoryId: data.category_id,
      translations: data.product_translations,
      images: data.product_images.map((image) => ({ id: image.id, alts: image.product_image_alts })),
      variants: data.product_variants
        .filter((variant) => variant.deleted_at === null)
        .map((variant) => ({ id: variant.id, labels: variant.product_variant_translations })),
    };
  } catch {
    return null;
  }
}

function contentOf(row: TranslationRow, { images, variants }: StoredTexts): TranslationContent {
  const texts = Object.fromEntries(
    TRANSLATABLE_FIELDS.map((field) => [field, row[columnOf(field)]]),
  ) as TranslationContent["texts"];
  const imageAlts = images.flatMap((image) => {
    const alt = image.alts.find((a) => a.locale === row.locale)?.alt;
    return alt ? [{ imageId: image.id, alt }] : [];
  });
  // the size names in the source locale go into the same call (#66)
  const variantLabels = variants.flatMap((variant) => {
    const label = variant.labels.find((l) => l.locale === row.locale)?.label;
    return label ? [{ variantId: variant.id, label }] : [];
  });
  return { texts, imageAlts, ...(variantLabels.length > 0 ? { variantLabels } : {}) };
}

// three attempts with their backoff stay within a Vercel function's 300 s
const ATTEMPT_TIMEOUT_MS = 90_000;

// enough candidates for any real catalogue: the base, then "-2" … "-20"
const SLUG_CANDIDATES = 20;

/** A free slug per new locale (an existing row keeps its own, so its URL never changes). */
async function slugsFor(
  productId: string,
  wanted: { locale: Locale; base: string }[],
): Promise<Map<Locale, string> | null> {
  if (wanted.length === 0) return new Map();
  const candidates = wanted.flatMap(({ base }) =>
    Array.from({ length: SLUG_CANDIDATES }, (_, i) => slugCandidate(base, i + 1, SLUG_MAX_LENGTH)),
  );
  const { data, error } = await createServiceClient()
    .from("product_translations")
    .select("product_id, locale, slug")
    .in("locale", wanted.map((w) => w.locale))
    .in("slug", [...new Set(candidates)]);
  if (error) return null;
  const taken = new Set(data.filter((row) => row.product_id !== productId).map((row) => `${row.locale}:${row.slug}`));
  return new Map(
    wanted.map(({ locale, base }) => [locale, uniqueSlug(base, (slug) => taken.has(`${locale}:${slug}`), SLUG_MAX_LENGTH)]),
  );
}

export type TranslateProductInput = {
  productId: string;
  /** Default: uk, else en (pickSourceLocale). */
  sourceLocale?: Locale;
  /** Default: every locale the product lacks. */
  targets?: Locale[];
  /** Replace the existing translations among the targets too (by default they are kept). */
  overwrite: boolean;
};

export type TranslateProductOutcome =
  | {
      ok: true;
      sourceLocale: Locale;
      translated: Locale[];
      failed: { locale: Locale; reason: LocaleFailure }[];
      categoryId: string;
      /** Every slug the product had or has now in the locales written: the storefront entries to revalidate. */
      slugs: string[];
    }
  | {
      ok: false;
      reason: "notFound" | "noSource" | "nothingToTranslate" | "notAuthorized" | "conflict" | "unexpectedError" | TranslateFailure;
    };

export async function translateProduct(
  input: TranslateProductInput,
  { model, writer }: { model: LanguageModel; writer: ServerSupabaseClient },
): Promise<TranslateProductOutcome> {
  const stored = await readTexts(input.productId);
  if (stored === "notFound") return { ok: false, reason: "notFound" };
  if (stored === null) return { ok: false, reason: "unexpectedError" };

  const existing = stored.translations.map((t) => t.locale);
  const sourceLocale = input.sourceLocale ?? pickSourceLocale(existing, EDITOR_LOCALES);
  const sourceRow = stored.translations.find((t) => t.locale === sourceLocale);
  if (!sourceLocale || !sourceRow) return { ok: false, reason: "noSource" };

  const targets = planTargets({
    allLocales: EDITOR_LOCALES,
    existing,
    sourceLocale,
    requested: input.targets,
    overwrite: input.overwrite,
  });
  if (targets.length === 0) return { ok: false, reason: "nothingToTranslate" };

  const content = contentOf(sourceRow, stored);
  const result = await translateContent({
    model,
    sourceLocale,
    targets,
    content,
    glossary: GLOSSARY,
    rules: GLOSSARY_RULES,
    timeoutMs: ATTEMPT_TIMEOUT_MS,
  });
  if (!result.ok) return { ok: false, reason: result.reason };

  const translated = targets.filter((l) => result.translations[l] !== undefined);
  const current = new Map(stored.translations.map((t) => [t.locale, t]));
  const slugs = await slugsFor(
    input.productId,
    translated
      .filter((locale) => !current.has(locale))
      .map((locale) => ({ locale, base: slugify(result.translations[locale]!.texts.title ?? "") || sourceRow.slug })),
  );
  if (!slugs) return { ok: false, reason: "unexpectedError" };

  const rows = translated.map((locale) => {
    const { texts } = result.translations[locale]!;
    return {
      product_id: input.productId,
      locale,
      slug: current.get(locale)?.slug ?? slugs.get(locale)!,
      title: texts.title ?? sourceRow.title,
      description: texts.description,
      materials: texts.materials,
      care: texts.care,
      clasp: texts.clasp,
      lead_time_note: texts.leadTimeNote,
      meta_title: texts.metaTitle,
      meta_description: texts.metaDescription,
      alt_text: texts.altText,
      source: "machine" as const,
      reviewed_at: null,
    };
  });
  const alts = translated.flatMap((locale) =>
    result.translations[locale]!.imageAlts.map(({ imageId, alt }) => ({ image_id: imageId, locale, alt })),
  );
  const sizeLabels = translated.flatMap((locale) =>
    (result.translations[locale]!.variantLabels ?? []).map(({ variantId, label }) => ({ variant_id: variantId, locale, label })),
  );

  try {
    const saved = await writer.from("product_translations").upsert(rows, { onConflict: "product_id,locale" });
    if (saved.error) {
      if (saved.error.code === "42501") return { ok: false, reason: "notAuthorized" };
      // a slug taken between the check and the save
      if (saved.error.code === "23505") return { ok: false, reason: "conflict" };
      return { ok: false, reason: "unexpectedError" };
    }
    if (alts.length > 0) {
      const savedAlts = await writer.from("product_image_alts").upsert(alts, { onConflict: "image_id,locale" });
      if (savedAlts.error) return { ok: false, reason: "unexpectedError" };
    }
    if (sizeLabels.length > 0) {
      const savedSizes = await writer.rpc("admin_save_variant_labels", {
        p_product_id: input.productId,
        p_labels: sizeLabels,
        // a size name already there is kept, like an existing translation
        p_overwrite: input.overwrite,
      });
      if (savedSizes.error) return { ok: false, reason: savedSizes.error.code === "42501" ? "notAuthorized" : "unexpectedError" };
    }
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }

  return {
    ok: true,
    sourceLocale,
    translated,
    failed: result.failed,
    categoryId: stored.categoryId,
    slugs: [...new Set([...rows.map((r) => r.slug), ...stored.translations.map((t) => t.slug)])],
  };
}

export type ReviewOutcome =
  | { ok: true; updated: { productId: string; slug: string }[] }
  | { ok: false; reason: "notAuthorized" | "unexpectedError" };

/**
 * Marks machine translations reviewed (indexable) or not reviewed again. Marking keeps the date of a row
 * reviewed earlier; human rows are left alone (they are indexable anyway).
 */
export async function setTranslationsReviewed(
  { productIds, locales, reviewed }: { productIds: string[]; locales?: Locale[]; reviewed: boolean },
  writer: ServerSupabaseClient,
): Promise<ReviewOutcome> {
  try {
    let query = writer
      .from("product_translations")
      .update({ reviewed_at: reviewed ? new Date().toISOString() : null })
      .in("product_id", productIds)
      .eq("source", "machine");
    if (locales) query = query.in("locale", locales);
    query = reviewed ? query.is("reviewed_at", null) : query.not("reviewed_at", "is", null);
    const { data, error } = await query.select("product_id, locale, slug");
    if (error) return { ok: false, reason: error.code === "42501" ? "notAuthorized" : "unexpectedError" };
    return {
      ok: true,
      updated: data.filter((row) => isLocale(row.locale)).map((row) => ({ productId: row.product_id, slug: row.slug })),
    };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}
