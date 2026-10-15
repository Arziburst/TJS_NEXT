"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseProductForm, STATUSES, type FieldErrors } from "@/lib/admin/product-form";
import { findSaveConflicts, getStoredProduct, sourceAfterSave } from "@/lib/admin/products";
import { revalidateProduct } from "@/lib/admin/revalidate";
import { getAdmin } from "@/lib/auth/session";
import { allowAdminAction } from "@/lib/admin/rate-limit";
import { ADMIN_PAGE_SIZE } from "@/lib/admin/products";
import { createSessionClient } from "@/lib/supabase/server";
import { locales, type Locale } from "@/i18n/routing";
import type { LocaleFailure, TranslateFailure } from "@/lib/translate/core";
import { translationModel } from "@/lib/translate/gateway";
import { setTranslationsReviewed, translateProduct as translateProductTexts } from "@/lib/translate/product";

/*
 * The admin's writes. Each action is a public entry point: it checks the admin itself, validates its input
 * with zod and writes through the caller's session (the database functions run as the caller, so RLS and
 * the audit trigger apply: created_by / updated_by come from the JWT), then expires the storefront caches.
 */

export type AdminFormError = "notAuthorized" | "notFound" | "conflict" | "unexpectedError";

export type SaveProductState =
  | { status: "idle" }
  | { status: "error"; error?: AdminFormError; fields?: FieldErrors }
  | { status: "saved"; id: string; created: boolean; savedAt: number };

function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) if (typeof value === "string") values[key] = value;
  return values;
}

function failed(error: AdminFormError, fields?: FieldErrors): SaveProductState {
  return { status: "error", error, fields };
}

/** Creates (no id) or updates a product with its translations. */
export async function saveProduct(_previous: SaveProductState, formData: FormData): Promise<SaveProductState> {
  if (!(await getAdmin())) return failed("notAuthorized");

  const parsed = parseProductForm(formValues(formData));
  if (!parsed.ok) return { status: "error", fields: parsed.fields };
  const { id, product, translations } = parsed.input;

  const stored = id === null ? null : await getStoredProduct(id);
  if (stored === "notFound") return failed("notFound");
  if (id !== null && stored === null) return failed("unexpectedError");

  const conflicts = await findSaveConflicts(id, product.sku, translations);
  if (!conflicts) return failed("unexpectedError");
  if (conflicts.slugs.length > 0 || conflicts.skuTaken) {
    const fields: FieldErrors = {};
    for (const { locale } of conflicts.slugs) fields[`tr.${locale}.slug`] = "slugTaken";
    if (conflicts.skuTaken) fields.sku = "skuTaken";
    return { status: "error", fields };
  }

  const payload = translations.map((t) => ({
    ...t,
    source: sourceAfterSave(t, stored?.translations.find((s) => s.locale === t.locale)),
  }));

  let savedId: string;
  try {
    const supabase = await createSessionClient();
    const { data, error } = await supabase.rpc("admin_save_product", {
      // a new product has no id yet; the function inserts it
      p_id: id as string,
      p_product: product,
      p_translations: payload,
    });
    if (error) {
      if (error.code === "42501") return failed("notAuthorized");
      if (error.code === "P0002") return failed("notFound");
      // a slug or SKU taken between the check and the save
      if (error.code === "23505") return failed("conflict");
      return failed("unexpectedError");
    }
    savedId = data;
  } catch {
    return failed("unexpectedError");
  }

  revalidateProduct({
    productId: savedId,
    categoryIds: [product.category_id, ...(stored ? [stored.categoryId] : [])],
    slugs: [...translations.map((t) => t.slug), ...(stored?.translations.map((t) => t.slug) ?? [])],
  });
  return { status: "saved", id: savedId, created: id === null, savedAt: Date.now() };
}

export type ProductActionResult =
  | { ok: true }
  | { ok: false; reason: "notAuthorized" | "invalid" | "notFound" | "needsUk" | "unexpectedError" };

const statusInput = z.object({ id: z.uuid(), status: z.enum(STATUSES) });
const deleteInput = z.object({ id: z.uuid() });

/** One tap in the list: publish (needs the uk translation), unpublish (back to draft) or archive. */
export async function setProductStatus(input: unknown): Promise<ProductActionResult> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  const parsed = statusInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { id, status } = parsed.data;

  const stored = await getStoredProduct(id);
  if (stored === "notFound") return { ok: false, reason: "notFound" };
  if (stored === null) return { ok: false, reason: "unexpectedError" };
  try {
    const supabase = await createSessionClient();
    const { data, error } = await supabase.rpc("admin_set_product_status", { p_id: id, p_status: status });
    if (error) {
      if (error.code === "42501") return { ok: false, reason: "notAuthorized" };
      if (error.code === "23514") return { ok: false, reason: "needsUk" };
      return { ok: false, reason: "unexpectedError" };
    }
    if (!data) return { ok: false, reason: "notFound" };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }

  revalidateProduct({ productId: id, categoryIds: [stored.categoryId], slugs: stored.translations.map((t) => t.slug) });
  refresh();
  return { ok: true };
}

export type TranslateErrorReason =
  | "notAuthorized"
  | "invalid"
  | "notConfigured"
  | "tooManyRequests"
  | "notFound"
  | "noSource"
  | "nothingToTranslate"
  | "conflict"
  | "unexpectedError"
  | TranslateFailure;

export type TranslateActionResult =
  | { ok: true; translated: Locale[]; failed: { locale: Locale; reason: LocaleFailure }[] }
  | { ok: false; reason: TranslateErrorReason };

const translateInput = z.object({
  id: z.uuid(),
  sourceLocale: z.enum(locales).optional(),
  targets: z.array(z.enum(locales)).min(1).max(locales.length).optional(),
  overwrite: z.boolean().default(false),
});

/**
 * Machine-translates one product from a source locale (default uk, else en) into the chosen locales (default:
 * every missing one) and saves them as unreviewed machine rows. One product per call: the list's bulk action
 * calls it product by product, so each call stays well within a function's time and shows its own progress.
 */
export async function translateProduct(input: unknown): Promise<TranslateActionResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, reason: "notAuthorized" };
  const parsed = translateInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const model = translationModel();
  if (!model) return { ok: false, reason: "notConfigured" };
  if (!(await allowAdminAction("translate", admin.id))) return { ok: false, reason: "tooManyRequests" };

  const { id, sourceLocale, targets, overwrite } = parsed.data;
  let outcome: Awaited<ReturnType<typeof translateProductTexts>>;
  try {
    outcome = await translateProductTexts(
      { productId: id, sourceLocale, targets, overwrite },
      { model, writer: await createSessionClient() },
    );
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
  if (!outcome.ok) return { ok: false, reason: outcome.reason };

  revalidateProduct({ productId: id, categoryIds: [outcome.categoryId], slugs: outcome.slugs });
  refresh();
  return { ok: true, translated: outcome.translated, failed: outcome.failed };
}

export type ReviewActionResult =
  | { ok: true; updated: number }
  | { ok: false; reason: "notAuthorized" | "invalid" | "tooManyRequests" | "unexpectedError" };

const reviewInput = z.union([
  // one locale of one product: the toggle in the form
  z.object({ ids: z.tuple([z.uuid()]), locale: z.enum(locales), reviewed: z.boolean() }),
  // every machine translation of the selected products: the list's bulk action
  z.object({ ids: z.array(z.uuid()).min(1).max(ADMIN_PAGE_SIZE), reviewed: z.literal(true) }),
]);

/** Marks machine translations reviewed (indexable) or takes the mark back. */
export async function setTranslationReviewed(input: unknown): Promise<ReviewActionResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, reason: "notAuthorized" };
  const parsed = reviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (!(await allowAdminAction("review", admin.id))) return { ok: false, reason: "tooManyRequests" };

  const { ids, reviewed } = parsed.data;
  const locale = "locale" in parsed.data ? parsed.data.locale : undefined;
  const outcome = await setTranslationsReviewed(
    { productIds: ids, locales: locale ? [locale] : undefined, reviewed },
    await createSessionClient(),
  );
  if (!outcome.ok) return { ok: false, reason: outcome.reason };

  for (const productId of new Set(outcome.updated.map((u) => u.productId))) {
    revalidateProduct({
      productId,
      categoryIds: [],
      slugs: outcome.updated.filter((u) => u.productId === productId).map((u) => u.slug),
    });
  }
  refresh();
  return { ok: true, updated: outcome.updated.length };
}

/** Soft delete (the row stays for order history); the storefront hides it at once. */
export async function deleteProduct(input: unknown): Promise<ProductActionResult> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { id } = parsed.data;

  const stored = await getStoredProduct(id);
  if (stored === "notFound") return { ok: false, reason: "notFound" };
  if (stored === null) return { ok: false, reason: "unexpectedError" };
  try {
    const supabase = await createSessionClient();
    const { data, error } = await supabase.rpc("admin_delete_product", { p_id: id });
    if (error) return { ok: false, reason: error.code === "42501" ? "notAuthorized" : "unexpectedError" };
    if (!data) return { ok: false, reason: "notFound" };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }

  revalidateProduct({ productId: id, categoryIds: [stored.categoryId], slugs: stored.translations.map((t) => t.slug) });
  return { ok: true };
}
