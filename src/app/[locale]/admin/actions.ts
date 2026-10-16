"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseProductForm, STATUSES, type FieldErrors } from "@/lib/admin/product-form";
import { findSaveConflicts, getStoredProduct, sourceAfterSave } from "@/lib/admin/products";
import { parseTermIds, PRODUCT_TERMS_FIELD } from "@/lib/admin/taxonomy-form";
import { revalidateProduct } from "@/lib/admin/revalidate";
import { usdTextToMinor } from "@/lib/catalog/mappers";
import { getAdmin } from "@/lib/auth/session";
import { createSessionClient } from "@/lib/supabase/server";

/*
 * The admin's writes. Each action is a public entry point: it checks the admin itself, validates its input
 * with zod and writes through the caller's session (the database functions run as the caller, so RLS and
 * the audit trigger apply: created_by / updated_by come from the JWT), then expires the storefront caches.
 */

export type AdminFormError = "notAuthorized" | "notFound" | "conflict" | "termsChanged" | "unexpectedError";

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
  // the materials and colours (#25), when the form showed their lists; else the product keeps its own
  const termIds = formData.has(`${PRODUCT_TERMS_FIELD}-shown`) ? parseTermIds(formData.getAll(PRODUCT_TERMS_FIELD)) : undefined;
  if (termIds === null) return failed("unexpectedError");

  const stored = id === null ? null : await getStoredProduct(id);
  if (stored === "notFound") return failed("notFound");
  if (id !== null && stored === null) return failed("unexpectedError");

  // a product with sizes (#66) stays made to order and keeps every size above zero (the database refuses it too)
  if (stored && stored.variantDeltas.length > 0) {
    const fields: FieldErrors = {};
    if (product.fulfillment !== "made_to_order") fields.fulfillment = "hasVariants";
    const price = usdTextToMinor(product.price_usd);
    if (price !== null && price + Math.min(...stored.variantDeltas) <= 0) fields.priceUsd = "variantPriceNotPositive";
    if (Object.keys(fields).length > 0) return { status: "error", fields };
  }

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
    const args = {
      // a new product has no id yet; the function inserts it
      p_id: id as string,
      p_product: product,
      p_translations: payload,
    };
    const { data, error } =
      termIds === undefined
        ? await supabase.rpc("admin_save_product", args)
        : await supabase.rpc("admin_save_product_with_terms", { ...args, p_term_ids: termIds });
    if (error) {
      if (error.code === "42501") return failed("notAuthorized");
      if (error.code === "P0002") return failed("notFound");
      // a slug or SKU taken between the check and the save
      if (error.code === "23505") return failed("conflict");
      // a ticked material or colour deleted meanwhile
      if (error.code === "23503") return failed("termsChanged");
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
