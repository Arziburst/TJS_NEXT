"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  deleteCollection as deleteStoredCollection,
  findCollectionSlugConflicts,
  getStoredCollection,
  removeCollectionCover,
  saveCollection as saveStoredCollection,
  setCollectionProducts as setStoredProducts,
  setCollectionPublished as setStoredPublished,
  storeCollectionCover,
  type AdminCollectionWriteError,
} from "@/lib/admin/collections";
import { collectionFormInput, MAX_COLLECTION_PRODUCTS, parseCollectionForm, type CollectionFieldErrors } from "@/lib/admin/collection-form";
import { createStagedUpload, type UploadError } from "@/lib/admin/images";
import { allowAdminAction } from "@/lib/admin/rate-limit";
import { revalidateCollection } from "@/lib/admin/revalidate";
import { parseSaleForm, saleFormInput, type SaleFieldErrors } from "@/lib/admin/sale-form";
import { removeSale, saveSale, type SaleWriteError } from "@/lib/admin/sales";
import { getAdmin } from "@/lib/auth/session";
import { createSessionClient } from "@/lib/supabase/server";

/*
 * The admin's collection actions (#67). Like the product actions, each one checks the admin itself, counts against
 * the admin's rate limit, validates its input with zod, writes through the admin's session (the database checks the
 * role again), then expires every storefront entry the write can change and refreshes the admin page.
 */

export type CollectionActionError = AdminCollectionWriteError | SaleWriteError | "tooManyRequests";
export type CollectionActionResult = { ok: true } | { ok: false; reason: CollectionActionError };
export type SaveCollectionResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; reason: CollectionActionError }
  | { ok: false; reason: "fields"; fields: CollectionFieldErrors };
export type CollectionSaleResult = CollectionActionResult | { ok: false; reason: "fields"; fields: SaleFieldErrors };
export type CoverUploadResult = { ok: true; uploadId: string; signedUrl: string } | { ok: false; reason: CollectionActionError };
export type FinishCoverResult = { ok: true } | { ok: false; reason: CollectionActionError | UploadError };

const idInput = z.object({ id: z.uuid() });
const publishedInput = z.object({ id: z.uuid(), published: z.boolean() });
const productsInput = z.object({ id: z.uuid(), productIds: z.array(z.uuid()).max(MAX_COLLECTION_PRODUCTS) });
const finishCoverInput = z.object({ id: z.uuid(), uploadId: z.uuid() });
const saleInput = saleFormInput.extend({ id: z.uuid() });

/** The admin, when the call may go ahead. */
async function admitted(): Promise<{ ok: true; adminId: string } | { ok: false; reason: "notAuthorized" | "tooManyRequests" }> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, reason: "notAuthorized" };
  if (!(await allowAdminAction("merchandising", admin.id))) return { ok: false, reason: "tooManyRequests" };
  return { ok: true, adminId: admin.id };
}

/** The collection as stored (for its caches), or the refusal. */
async function stored(id: string) {
  const collection = await getStoredCollection(id);
  if (collection === null) return { ok: false as const, reason: "notFound" as const };
  if (collection === undefined) return { ok: false as const, reason: "unexpectedError" as const };
  return { ok: true as const, collection };
}

function changed(id: string, before: { slugs: string[]; productIds: string[] }, after?: { slugs?: string[]; productIds?: string[] }) {
  revalidateCollection({
    collectionId: id,
    slugs: [...before.slugs, ...(after?.slugs ?? [])],
    productIds: [...before.productIds, ...(after?.productIds ?? [])],
  });
  refresh();
}

/** Creates (no id) or saves a collection: its names, slugs and descriptions, published flag and place. */
export async function saveCollection(input: unknown): Promise<SaveCollectionResult> {
  const admin = await admitted();
  if (!admin.ok) return admin;
  const parsed = collectionFormInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { id, published, position } = parsed.data;
  const form = parseCollectionForm(parsed.data);
  if (!form.ok) return { ok: false, reason: "fields", fields: form.fields };

  let before: { slugs: string[]; productIds: string[] } = { slugs: [], productIds: [] };
  if (id !== null) {
    const found = await stored(id);
    if (!found.ok) return found;
    before = found.collection;
  }
  const conflicts = await findCollectionSlugConflicts(id, form.translations);
  if (conflicts === null) return { ok: false, reason: "unexpectedError" };
  if (conflicts.length > 0) {
    return { ok: false, reason: "fields", fields: Object.fromEntries(conflicts.map((locale) => [`${locale}.slug`, "slugTaken"])) };
  }

  const result = await saveStoredCollection(await createSessionClient(), { id, published, position, translations: form.translations });
  if (!result.ok) return result;
  changed(result.id, before, { slugs: form.translations.map((t) => t.slug) });
  return { ok: true, id: result.id, created: id === null };
}

/** One tap in the list or the form: publish (needs the uk name) or unpublish. */
export async function setCollectionPublished(input: unknown): Promise<CollectionActionResult> {
  const admin = await admitted();
  if (!admin.ok) return admin;
  const parsed = publishedInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const before = await stored(parsed.data.id);
  if (!before.ok) return before;
  const result = await setStoredPublished(await createSessionClient(), parsed.data.id, parsed.data.published);
  if (!result.ok) return result;
  changed(parsed.data.id, before.collection);
  return { ok: true };
}

/** The collection's pieces in their new order: adding, removing and reordering are one list. */
export async function setCollectionProducts(input: unknown): Promise<CollectionActionResult> {
  const admin = await admitted();
  if (!admin.ok) return admin;
  const parsed = productsInput.safeParse(input);
  if (!parsed.success || new Set(parsed.data.productIds).size !== parsed.data.productIds.length) return { ok: false, reason: "invalid" };
  const before = await stored(parsed.data.id);
  if (!before.ok) return before;
  const result = await setStoredProducts(await createSessionClient(), parsed.data.id, parsed.data.productIds);
  if (!result.ok) return result;
  // the pieces it held and the ones it holds now: their prices follow the collection's sale
  changed(parsed.data.id, before.collection, { productIds: parsed.data.productIds });
  return { ok: true };
}

/** Deletes a collection; its pieces stay in the shop. */
export async function deleteCollection(input: unknown): Promise<CollectionActionResult> {
  const admin = await admitted();
  if (!admin.ok) return admin;
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const before = await stored(parsed.data.id);
  if (!before.ok) return before;
  const result = await deleteStoredCollection(await createSessionClient(), parsed.data.id);
  if (!result.ok) return result;
  revalidateCollection({ collectionId: parsed.data.id, ...before.collection });
  return { ok: true };
}

/** Starts or changes the collection's sale: a percentage off every piece, with an optional window. */
export async function saveCollectionSale(input: unknown): Promise<CollectionSaleResult> {
  const admin = await admitted();
  if (!admin.ok) return admin;
  const parsed = saleInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const form = parseSaleForm(parsed.data, "collection", null);
  if (!form.ok) return { ok: false, reason: "fields", fields: form.fields };
  const before = await stored(parsed.data.id);
  if (!before.ok) return before;
  const result = await saveSale(await createSessionClient(), "collection", parsed.data.id, form.sale);
  if (!result.ok) return result;
  changed(parsed.data.id, before.collection);
  return { ok: true };
}

/** Ends the collection's sale now. */
export async function removeCollectionSale(input: unknown): Promise<CollectionActionResult> {
  const admin = await admitted();
  if (!admin.ok) return admin;
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const before = await stored(parsed.data.id);
  if (!before.ok) return before;
  const result = await removeSale(await createSessionClient(), "collection", parsed.data.id);
  if (!result.ok) return result;
  changed(parsed.data.id, before.collection);
  return { ok: true };
}

/** Step 1 of a cover upload: a signed URL into the admin's staging folder (the photos' pipeline, #18). */
export async function createCoverUpload(input: unknown): Promise<CoverUploadResult> {
  const admin = await admitted();
  if (!admin.ok) return admin;
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const before = await stored(parsed.data.id);
  if (!before.ok) return before;
  return createStagedUpload(await createSessionClient(), admin.adminId);
}

/** Step 2: the staged file checked, cleaned and set as the cover. */
export async function finishCoverUpload(input: unknown): Promise<FinishCoverResult> {
  const admin = await admitted();
  if (!admin.ok) return admin;
  const parsed = finishCoverInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const before = await stored(parsed.data.id);
  if (!before.ok) return before;
  const result = await storeCollectionCover(await createSessionClient(), {
    adminId: admin.adminId,
    collectionId: parsed.data.id,
    uploadId: parsed.data.uploadId,
  });
  if (!result.ok) return result;
  changed(parsed.data.id, before.collection);
  return { ok: true };
}

/** Removes the cover photo. */
export async function removeCover(input: unknown): Promise<CollectionActionResult> {
  const admin = await admitted();
  if (!admin.ok) return admin;
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const before = await stored(parsed.data.id);
  if (!before.ok) return before;
  const result = await removeCollectionCover(await createSessionClient(), parsed.data.id);
  if (!result.ok) return result;
  changed(parsed.data.id, before.collection);
  return { ok: true };
}
