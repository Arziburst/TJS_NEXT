"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getStoredProduct, type StoredProduct } from "@/lib/admin/products";
import { revalidateProduct } from "@/lib/admin/revalidate";
import { labelSources, parseVariantForm, variantFormInput, type VariantFieldErrors } from "@/lib/admin/variant-form";
import {
  deleteVariant,
  getStoredVariantLabels,
  reorderVariants,
  saveVariant,
  setVariantAvailable,
  type VariantWriteError,
} from "@/lib/admin/variants";
import { getAdmin } from "@/lib/auth/session";
import { createSessionClient } from "@/lib/supabase/server";

/*
 * The admin's size actions (#66). Like the product and photo actions, each one checks the admin itself, validates
 * its input with zod, writes through the admin's session (the database functions check the role again), then
 * expires the product's storefront caches (product page, listings) and refreshes the admin page.
 */

export type VariantActionError = VariantWriteError | "invalid";
export type VariantActionResult = { ok: true } | { ok: false; reason: VariantActionError };
export type SaveVariantResult = VariantActionResult | { ok: false; reason: "fields"; fields: VariantFieldErrors };

// far above any real size range; keeps a forged request small (the database allows 50)
const MAX_VARIANTS = 50;

const saveInput = variantFormInput.extend({
  productId: z.uuid(),
  variantId: z.uuid().nullable(),
  available: z.boolean(),
});
const availableInput = z.object({ productId: z.uuid(), variantId: z.uuid(), available: z.boolean() });
const reorderInput = z.object({ productId: z.uuid(), variantIds: z.array(z.uuid()).min(1).max(MAX_VARIANTS) });
const deleteInput = z.object({ productId: z.uuid(), variantId: z.uuid() });

async function storedProduct(productId: string) {
  const stored = await getStoredProduct(productId);
  if (stored === "notFound") return { ok: false as const, reason: "notFound" as const };
  if (stored === null) return { ok: false as const, reason: "unexpectedError" as const };
  return { ok: true as const, stored };
}

function changed(productId: string, stored: StoredProduct): void {
  revalidateProduct({ productId, categoryIds: [stored.categoryId], slugs: stored.translations.map((t) => t.slug) });
  refresh();
}

/** Adds a size (no `variantId`, as the last one) or saves one: its labels, price difference, suffix and state. */
export async function saveProductVariant(input: unknown): Promise<SaveVariantResult> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { productId, variantId, available } = parsed.data;
  const product = await storedProduct(productId);
  if (!product.ok) return product;
  if (product.stored.fulfillment !== "made_to_order") return { ok: false, reason: "oneOfAKind" };
  if (product.stored.priceUsdMinor === null) return { ok: false, reason: "unexpectedError" };

  const form = parseVariantForm(parsed.data, product.stored.priceUsdMinor);
  if (!form.ok) return { ok: false, reason: "fields", fields: form.fields };
  let variant = form.input;
  if (variantId) {
    // a label the admin did not change keeps its source (a machine name stays machine); an edited one is human
    const stored = await getStoredVariantLabels(productId, variantId);
    if (stored === "notFound") return { ok: false, reason: "notFound" };
    if (stored === null) return { ok: false, reason: "unexpectedError" };
    variant = { ...variant, labels: labelSources(variant.labels, stored) };
  }
  const result = await saveVariant(await createSessionClient(), { productId, variantId, input: variant, available });
  if (!result.ok) {
    // a suffix another size took is the field's error
    if (result.reason === "suffixTaken") return { ok: false, reason: "fields", fields: { skuSuffix: "suffixTaken" } };
    return result;
  }
  changed(productId, product.stored);
  return { ok: true };
}

/** One tap: a size can be ordered again, or not for now. */
export async function setProductVariantAvailable(input: unknown): Promise<VariantActionResult> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  const parsed = availableInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const product = await storedProduct(parsed.data.productId);
  if (!product.ok) return product;

  const result = await setVariantAvailable(await createSessionClient(), parsed.data);
  if (!result.ok) return result;
  changed(parsed.data.productId, product.stored);
  return { ok: true };
}

/** The sizes in a new order, as the shop lists them. */
export async function reorderProductVariants(input: unknown): Promise<VariantActionResult> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  const parsed = reorderInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const product = await storedProduct(parsed.data.productId);
  if (!product.ok) return product;

  const result = await reorderVariants(await createSessionClient(), parsed.data);
  if (!result.ok) {
    // another tab added or deleted a size: show the current sizes
    if (result.reason === "conflict") refresh();
    return result;
  }
  changed(parsed.data.productId, product.stored);
  return { ok: true };
}

/** Deletes a size nobody ordered; an ordered one is refused (switch it off instead). */
export async function deleteProductVariant(input: unknown): Promise<VariantActionResult> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const product = await storedProduct(parsed.data.productId);
  if (!product.ok) return product;

  const result = await deleteVariant(await createSessionClient(), parsed.data);
  if (!result.ok) return result;
  changed(parsed.data.productId, product.stored);
  return { ok: true };
}
