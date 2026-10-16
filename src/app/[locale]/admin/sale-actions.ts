"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getStoredProduct } from "@/lib/admin/products";
import { allowAdminAction } from "@/lib/admin/rate-limit";
import { revalidateProduct } from "@/lib/admin/revalidate";
import { parseSaleForm, saleFormInput, type SaleFieldErrors } from "@/lib/admin/sale-form";
import { removeSale, saveSale, type SaleWriteError } from "@/lib/admin/sales";
import { getAdmin } from "@/lib/auth/session";
import { createSessionClient } from "@/lib/supabase/server";

/*
 * The admin's product sale actions (#67): a percentage off or a fixed sale price in USD, with an optional window.
 * Like the size actions, each one checks the admin itself, counts against the admin's rate limit, validates its input
 * with zod, writes through the admin's session (RLS checks the role again), then expires the product's storefront
 * caches (its pages, the listings) and refreshes the admin page.
 */

export type ProductSaleError = SaleWriteError | "invalid" | "tooManyRequests";
export type ProductSaleResult = { ok: true } | { ok: false; reason: ProductSaleError } | { ok: false; reason: "fields"; fields: SaleFieldErrors };

const saveInput = saleFormInput.extend({ id: z.uuid() });
const removeInput = z.object({ id: z.uuid() });

async function admittedProduct(productId: string) {
  const admin = await getAdmin();
  if (!admin) return { ok: false as const, reason: "notAuthorized" as const };
  if (!(await allowAdminAction("merchandising", admin.id))) return { ok: false as const, reason: "tooManyRequests" as const };
  const stored = await getStoredProduct(productId);
  if (stored === "notFound") return { ok: false as const, reason: "notFound" as const };
  if (stored === null) return { ok: false as const, reason: "unexpectedError" as const };
  return { ok: true as const, stored };
}

/** Starts or changes the product's sale; a fixed price must be below its regular price. */
export async function saveProductSale(input: unknown): Promise<ProductSaleResult> {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) {
    // still the admin's call to make: a guest learns nothing from a refusal of malformed input
    if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
    return { ok: false, reason: "invalid" };
  }
  const product = await admittedProduct(parsed.data.id);
  if (!product.ok) return product;
  const form = parseSaleForm(parsed.data, "product", product.stored.priceUsdMinor);
  if (!form.ok) return { ok: false, reason: "fields", fields: form.fields };
  const result = await saveSale(await createSessionClient(), "product", parsed.data.id, form.sale);
  if (!result.ok) return result;
  changed(parsed.data.id, product.stored);
  return { ok: true };
}

/** Ends the product's sale now. */
export async function removeProductSale(input: unknown): Promise<ProductSaleResult> {
  const parsed = removeInput.safeParse(input);
  if (!parsed.success) {
    if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
    return { ok: false, reason: "invalid" };
  }
  const product = await admittedProduct(parsed.data.id);
  if (!product.ok) return product;
  const result = await removeSale(await createSessionClient(), "product", parsed.data.id);
  if (!result.ok) return result;
  changed(parsed.data.id, product.stored);
  return { ok: true };
}

function changed(productId: string, stored: { categoryId: string; translations: { slug: string }[] }): void {
  revalidateProduct({ productId, categoryIds: [stored.categoryId], slugs: stored.translations.map((t) => t.slug) });
  refresh();
}
