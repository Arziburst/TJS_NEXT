"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { locales } from "@/i18n/routing";
import {
  createStagedUpload,
  deleteImage,
  reorderImages,
  saveImageAlts,
  storeStagedUpload,
  type ImageWriteError,
  type UploadError,
} from "@/lib/admin/images";
import { IMAGE_ALT_MAX_LENGTH } from "@/lib/admin/product-form";
import { getStoredProduct } from "@/lib/admin/products";
import { revalidateProduct } from "@/lib/admin/revalidate";
import { getAdmin } from "@/lib/auth/session";
import { createSessionClient } from "@/lib/supabase/server";

/*
 * The admin's photo actions. Like the product actions, each one checks the admin itself, validates its input
 * with zod, writes through the admin's session (RLS checks the role again), then expires the product's
 * storefront caches and refreshes the admin page.
 */

export type ImageActionError = ImageWriteError | "invalid";
export type ImageActionResult = { ok: true } | { ok: false; reason: ImageActionError };
export type CreateUploadResult = { ok: true; uploadId: string; signedUrl: string } | { ok: false; reason: ImageActionError };
export type FinishUploadResult = { ok: true } | { ok: false; reason: ImageActionError | UploadError };

// far above any real gallery; keeps a forged request small
const MAX_IMAGES = 200;

const productInput = z.object({ productId: z.uuid() });
const finishInput = z.object({ productId: z.uuid(), uploadId: z.uuid() });
const deleteInput = z.object({ productId: z.uuid(), imageId: z.uuid() });
const reorderInput = z.object({ productId: z.uuid(), imageIds: z.array(z.uuid()).min(1).max(MAX_IMAGES) });
const altsInput = z.object({
  productId: z.uuid(),
  imageId: z.uuid(),
  alts: z.partialRecord(z.enum(locales), z.string().trim().max(IMAGE_ALT_MAX_LENGTH)),
});

/** The product as stored (for its caches), or the refusal. */
async function storedProduct(productId: string) {
  const stored = await getStoredProduct(productId);
  if (stored === "notFound") return { ok: false as const, reason: "notFound" as const };
  if (stored === null) return { ok: false as const, reason: "unexpectedError" as const };
  return { ok: true as const, stored };
}

function changed(productId: string, stored: { categoryId: string; translations: { slug: string }[] }): void {
  revalidateProduct({ productId, categoryIds: [stored.categoryId], slugs: stored.translations.map((t) => t.slug) });
  refresh();
}

/** Step 1 of an upload: a signed URL into the admin's staging folder. */
export async function createImageUpload(input: unknown): Promise<CreateUploadResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, reason: "notAuthorized" };
  const parsed = productInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const product = await storedProduct(parsed.data.productId);
  if (!product.ok) return product;
  return createStagedUpload(await createSessionClient(), admin.id);
}

/** Step 2 of an upload: the staged file checked, cleaned and added as the product's last photo. */
export async function finishImageUpload(input: unknown): Promise<FinishUploadResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, reason: "notAuthorized" };
  const parsed = finishInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { productId, uploadId } = parsed.data;
  const product = await storedProduct(productId);
  if (!product.ok) return product;

  const result = await storeStagedUpload(await createSessionClient(), { adminId: admin.id, productId, uploadId });
  if (!result.ok) return result;
  changed(productId, product.stored);
  return { ok: true };
}

/** Deletes one photo, its row and its file. */
export async function deleteProductImage(input: unknown): Promise<ImageActionResult> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  const parsed = deleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const product = await storedProduct(parsed.data.productId);
  if (!product.ok) return product;

  const result = await deleteImage(await createSessionClient(), parsed.data);
  if (!result.ok) return result;
  changed(parsed.data.productId, product.stored);
  return { ok: true };
}

/** The photos in a new order; the first one is the main photo. */
export async function reorderProductImages(input: unknown): Promise<ImageActionResult> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  const parsed = reorderInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const product = await storedProduct(parsed.data.productId);
  if (!product.ok) return product;

  const result = await reorderImages(await createSessionClient(), parsed.data);
  if (!result.ok) {
    // another tab added or deleted a photo: show the current photos
    if (result.reason === "conflict") refresh();
    return result;
  }
  changed(parsed.data.productId, product.stored);
  return { ok: true };
}

/** A photo's alt texts per locale; an empty one falls back to the product's title. */
export async function saveProductImageAlts(input: unknown): Promise<ImageActionResult> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  const parsed = altsInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { productId, imageId, alts } = parsed.data;
  const product = await storedProduct(productId);
  if (!product.ok) return product;

  const filled = locales.flatMap((locale) => {
    const alt = alts[locale];
    return alt ? [{ locale, alt }] : [];
  });
  const result = await saveImageAlts(await createSessionClient(), { productId, imageId, alts: filled });
  if (!result.ok) return result;
  changed(productId, product.stored);
  return { ok: true };
}
