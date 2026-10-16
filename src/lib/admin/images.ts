import "server-only";

import { randomUUID } from "node:crypto";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/catalog";
import { encodeForStorage } from "@/lib/images/encode";
import type { Locale } from "@/i18n/routing";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { STAGING_BUCKET } from "./staged-sweep";

/*
 * The admin's photo writes, through the admin's own session (`client`): Storage and the database check the
 * admin role again in their RLS policies. The callers (Server Actions) check the admin and validate the input
 * first.
 *
 * A photo is uploaded in two steps, because a phone photo is larger than a Vercel function accepts: the
 * browser puts the file into the private staging bucket through a signed URL (createStagedUpload), then
 * storeStagedUpload checks the staged bytes, re-encodes them without metadata and writes the result to the
 * public bucket under a new path (the image optimizer caches by URL for 31 days: a path is never reused).
 */

export type ImageWriteError = "notFound" | "conflict" | "notAuthorized" | "unexpectedError";
export type UploadError = "uploadMissing" | "tooLarge" | "unsupportedType" | "invalidImage";

/** Each admin stages in a folder of their own (the bucket's policies require it). */
export function stagedPath(adminId: string, uploadId: string): string {
  return `${adminId}/${uploadId}`;
}

function rpcError(code: string | undefined): ImageWriteError {
  if (code === "42501") return "notAuthorized";
  if (code === "P0002") return "notFound";
  if (code === "40001") return "conflict";
  return "unexpectedError";
}

/** A signed URL the browser uploads one photo to (valid for two hours), under a new upload id. */
export async function createStagedUpload(
  client: ServerSupabaseClient,
  adminId: string,
): Promise<{ ok: true; uploadId: string; signedUrl: string } | { ok: false; reason: "unexpectedError" }> {
  const uploadId = randomUUID();
  try {
    const { data, error } = await client.storage.from(STAGING_BUCKET).createSignedUploadUrl(stagedPath(adminId, uploadId));
    if (error) return { ok: false, reason: "unexpectedError" };
    return { ok: true, uploadId, signedUrl: data.signedUrl };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

/**
 * Turns a staged upload into the product's last photo: checks it (size and type by content, decodable),
 * re-encodes it without metadata, stores it under a new path with its width, height and blur placeholder.
 * The staged file is deleted whatever the outcome.
 */
export async function storeStagedUpload(
  client: ServerSupabaseClient,
  { adminId, productId, uploadId }: { adminId: string; productId: string; uploadId: string },
): Promise<{ ok: true; imageId: string } | { ok: false; reason: UploadError | ImageWriteError }> {
  const staged = stagedPath(adminId, uploadId);
  try {
    const { data: blob, error } = await client.storage.from(STAGING_BUCKET).download(staged);
    if (error || !blob) return { ok: false, reason: "uploadMissing" };
    const encoded = await encodeForStorage(new Uint8Array(await blob.arrayBuffer()));
    if (!encoded.ok) return encoded;
    const { image } = encoded;

    const storagePath = `products/${productId}/${randomUUID()}.${image.extension}`;
    const upload = await client.storage
      .from(PRODUCT_IMAGES_BUCKET)
      // the path is never reused, so browsers and the image optimizer may keep it for a year
      .upload(storagePath, image.bytes, { contentType: image.contentType, upsert: false, cacheControl: "31536000" });
    if (upload.error) return { ok: false, reason: "unexpectedError" };

    const { data: imageId, error: rowError } = await client.rpc("admin_add_product_image", {
      p_product_id: productId,
      p_storage_path: storagePath,
      p_width: image.width,
      p_height: image.height,
      p_blur_data_url: image.blurDataUrl,
    });
    if (rowError) {
      await client.storage.from(PRODUCT_IMAGES_BUCKET).remove([storagePath]);
      return { ok: false, reason: rpcError(rowError.code) };
    }
    return { ok: true, imageId };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  } finally {
    await client.storage
      .from(STAGING_BUCKET)
      .remove([staged])
      .catch(() => undefined);
  }
}

/**
 * Deletes a photo's row (its alt texts go with it), then its file. The photo is gone from the shop with its
 * row; a file Storage did not remove is only unused, reported in `fileRemoved` and the server log (and listed
 * by scripts/images/strip-metadata.mjs among the files no row points at).
 */
export async function deleteImage(
  client: ServerSupabaseClient,
  { productId, imageId }: { productId: string; imageId: string },
): Promise<{ ok: true; fileRemoved: boolean } | { ok: false; reason: ImageWriteError }> {
  try {
    const { data, error } = await client
      .from("product_images")
      .delete()
      .eq("id", imageId)
      .eq("product_id", productId)
      .select("storage_path")
      .maybeSingle();
    if (error) return { ok: false, reason: "unexpectedError" };
    if (!data) return { ok: false, reason: "notFound" };
    const removed = await client.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .remove([data.storage_path])
      .catch((error: unknown) => ({ data: null, error }));
    const fileRemoved = !removed.error && removed.data?.length === 1;
    if (!fileRemoved) {
      console.error("product photo: row deleted, file kept", data.storage_path, removed.error ?? "not found in Storage");
    }
    return { ok: true, fileRemoved };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

/** The new order of all the product's photos; the first is the main one. */
export async function reorderImages(
  client: ServerSupabaseClient,
  { productId, imageIds }: { productId: string; imageIds: string[] },
): Promise<{ ok: true } | { ok: false; reason: ImageWriteError }> {
  try {
    const { error } = await client.rpc("admin_reorder_product_images", { p_product_id: productId, p_image_ids: imageIds });
    return error ? { ok: false, reason: rpcError(error.code) } : { ok: true };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

/** Replaces a photo's alt texts; a locale left out falls back to the product's title on the storefront. */
export async function saveImageAlts(
  client: ServerSupabaseClient,
  { productId, imageId, alts }: { productId: string; imageId: string; alts: { locale: Locale; alt: string }[] },
): Promise<{ ok: true } | { ok: false; reason: ImageWriteError }> {
  try {
    const { data, error } = await client.rpc("admin_save_image_alts", {
      p_product_id: productId,
      p_image_id: imageId,
      p_alts: alts,
    });
    if (error) return { ok: false, reason: rpcError(error.code) };
    return data ? { ok: true } : { ok: false, reason: "notFound" };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}
