import "server-only";

import { randomUUID } from "node:crypto";
import type { Locale } from "@/i18n/routing";
import { getAdmin } from "@/lib/auth/session";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/catalog";
import { isLocale, usdTextToMinor } from "@/lib/catalog/mappers";
import { encodeForStorage } from "@/lib/images/encode";
import { createServiceClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import type { CollectionTranslationWrite } from "./collection-form";
import { stagedPath, type UploadError } from "./images";
import { EDITOR_LOCALES } from "./product-form";
import type { ProductStatus } from "./product-form";
import { STAGING_BUCKET } from "./staged-sweep";

/*
 * The admin's collections (#67). Reads go through the service role after the admin check (drafts and the audit
 * columns are not readable by the API roles); writes through the admin's session to the admin functions, which run
 * as the caller (RLS and the audit trigger apply).
 */

export type AdminCollectionWriteError = "notAuthorized" | "notFound" | "slugTaken" | "needsUk" | "invalid" | "unexpectedError";

export type AdminCollectionTranslation = { name: string; slug: string; description: string | null };

export type AdminCollectionListItem = {
  id: string;
  name: string;
  published: boolean;
  productCount: number;
  hasSale: boolean;
  cover: { url: string; width: number; height: number } | null;
};

export type AdminCollectionProduct = {
  id: string;
  title: string;
  sku: string | null;
  status: ProductStatus;
  /** The regular price (USD cents), shown next to the piece. */
  priceUsdMinor: number | null;
  image: { url: string; width: number; height: number } | null;
};

export type AdminCollection = {
  id: string;
  published: boolean;
  position: number;
  translations: Partial<Record<Locale, AdminCollectionTranslation>>;
  cover: { url: string; width: number; height: number; storagePath: string } | null;
  products: AdminCollectionProduct[];
};

function imageUrl(client: ServerSupabaseClient, path: string): string {
  return client.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}

function nameFor(rows: { locale: string; name: string }[], locale: Locale): string {
  return (rows.find((r) => r.locale === locale) ?? EDITOR_LOCALES.map((l) => rows.find((r) => r.locale === l)).find(Boolean))?.name ?? "";
}

/** Every collection in the owner's order, named in the admin's locale (else uk, en, …). */
export async function listAdminCollections(locale: Locale): Promise<AdminCollectionListItem[] | null> {
  if (!(await getAdmin())) return null;
  try {
    const client = createServiceClient();
    const { data, error } = await client
      .from("collections")
      .select(
        "id, is_published, position, cover_storage_path, cover_width, cover_height, collection_translations(locale, name), collection_products(count), collection_sales(collection_id)",
      )
      .order("position")
      .order("created_at");
    if (error) return null;
    return data.map((row) => ({
      id: row.id,
      name: nameFor(row.collection_translations, locale),
      published: row.is_published,
      productCount: row.collection_products[0]?.count ?? 0,
      hasSale: row.collection_sales !== null,
      cover:
        row.cover_storage_path && row.cover_width && row.cover_height
          ? { url: imageUrl(client, row.cover_storage_path), width: row.cover_width, height: row.cover_height }
          : null,
    }));
  } catch {
    return null;
  }
}

type ProductRow = {
  id: string;
  sku: string | null;
  status: ProductStatus;
  price_usd_text: string;
  product_translations: { locale: string; title: string }[];
  product_images: { storage_path: string; position: number; width: number; height: number }[];
};

function toAdminProduct(client: ServerSupabaseClient, row: ProductRow, locale: Locale): AdminCollectionProduct {
  const titles = row.product_translations.map((t) => ({ locale: t.locale, name: t.title }));
  const [photo] = [...row.product_images].sort((a, b) => a.position - b.position);
  return {
    id: row.id,
    title: nameFor(titles, locale) || (row.sku ?? row.id),
    sku: row.sku,
    status: row.status,
    priceUsdMinor: usdTextToMinor(row.price_usd_text),
    image: photo ? { url: imageUrl(client, photo.storage_path), width: photo.width, height: photo.height } : null,
  };
}

const PRODUCT_COLUMNS =
  "id, sku, status, price_usd_text:price_usd::text, product_translations(locale, title), product_images(storage_path, position, width, height)";

/** A collection with its translations, cover and pieces in the owner's order (deleted products left out). */
export async function getAdminCollection(id: string, locale: Locale): Promise<{ ok: true; data: AdminCollection } | { ok: false; reason: "notFound" | "unexpectedError" | "notAuthorized" }> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  try {
    const client = createServiceClient();
    const { data, error } = await client
      .from("collections")
      .select(
        `id, is_published, position, cover_storage_path, cover_width, cover_height,
         collection_translations(locale, slug, name, description),
         collection_products(position, products(${PRODUCT_COLUMNS}, deleted_at))`,
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return { ok: false, reason: "unexpectedError" };
    if (!data) return { ok: false, reason: "notFound" };
    const products = [...data.collection_products]
      .sort((a, b) => a.position - b.position)
      .flatMap(({ products: product }) => (product && product.deleted_at === null ? [toAdminProduct(client, product, locale)] : []));
    return {
      ok: true,
      data: {
        id: data.id,
        published: data.is_published,
        position: data.position,
        translations: Object.fromEntries(
          data.collection_translations
            .filter((t) => isLocale(t.locale))
            .map((t) => [t.locale, { name: t.name, slug: t.slug, description: t.description }]),
        ),
        cover:
          data.cover_storage_path && data.cover_width && data.cover_height
            ? { url: imageUrl(client, data.cover_storage_path), width: data.cover_width, height: data.cover_height, storagePath: data.cover_storage_path }
            : null,
        products,
      },
    };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

// far above the catalogue (the legacy shop had about 200 pieces); the API answers at most 1000 rows
const PICKABLE_LIMIT = 1000;

/** Every product that is not deleted, newest first: the pieces the admin can add to a collection. */
export async function listPickableProducts(locale: Locale): Promise<AdminCollectionProduct[] | null> {
  if (!(await getAdmin())) return null;
  try {
    const client = createServiceClient();
    const { data, error } = await client
      .from("products")
      .select(PRODUCT_COLUMNS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(PICKABLE_LIMIT);
    if (error) return null;
    return data.map((row) => toAdminProduct(client, row, locale));
  } catch {
    return null;
  }
}

/** The slugs a collection has (for its caches) and the products it holds, as stored; null when it is gone. */
export async function getStoredCollection(id: string): Promise<{ slugs: string[]; productIds: string[]; coverPath: string | null } | null | undefined> {
  try {
    const { data, error } = await createServiceClient()
      .from("collections")
      .select("id, cover_storage_path, collection_translations(slug), collection_products(product_id)")
      .eq("id", id)
      .maybeSingle();
    if (error) return undefined;
    if (!data) return null;
    return {
      slugs: data.collection_translations.map((t) => t.slug),
      productIds: data.collection_products.map((p) => p.product_id),
      coverPath: data.cover_storage_path,
    };
  } catch {
    return undefined;
  }
}

function writeError(code: string | undefined): AdminCollectionWriteError {
  if (code === "42501") return "notAuthorized";
  if (code === "P0002") return "notFound";
  if (code === "23505") return "slugTaken";
  if (code === "23514") return "needsUk";
  if (code === "22023" || code === "23503") return "invalid";
  return "unexpectedError";
}

/** Creates (no id) or updates a collection with its translations; the saved id. */
export async function saveCollection(
  client: ServerSupabaseClient,
  input: { id: string | null; published: boolean; position: number; translations: CollectionTranslationWrite[] },
): Promise<{ ok: true; id: string } | { ok: false; reason: AdminCollectionWriteError }> {
  try {
    const { data, error } = await client.rpc("admin_save_collection", {
      // a new collection has no id yet; the function inserts it
      p_id: input.id as string,
      p_collection: { is_published: input.published, position: input.position },
      p_translations: input.translations,
    });
    return error ? { ok: false, reason: writeError(error.code) } : { ok: true, id: data };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

/** Slugs another collection already has in that locale (the form names them before saving). */
export async function findCollectionSlugConflicts(id: string | null, translations: readonly CollectionTranslationWrite[]): Promise<Locale[] | null> {
  if (translations.length === 0) return [];
  try {
    const { data, error } = await createServiceClient()
      .from("collection_translations")
      .select("collection_id, locale, slug")
      .in("slug", translations.map((t) => t.slug));
    if (error) return null;
    return translations
      .filter((t) => data.some((row) => row.locale === t.locale && row.slug === t.slug && row.collection_id !== id))
      .map((t) => t.locale);
  } catch {
    return null;
  }
}

export async function setCollectionPublished(
  client: ServerSupabaseClient,
  id: string,
  published: boolean,
): Promise<{ ok: true } | { ok: false; reason: AdminCollectionWriteError }> {
  try {
    const { data, error } = await client.rpc("admin_set_collection_published", { p_id: id, p_published: published });
    if (error) return { ok: false, reason: writeError(error.code) };
    return data ? { ok: true } : { ok: false, reason: "notFound" };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

/** The collection's pieces, exactly these, in this order. */
export async function setCollectionProducts(
  client: ServerSupabaseClient,
  id: string,
  productIds: readonly string[],
): Promise<{ ok: true } | { ok: false; reason: AdminCollectionWriteError }> {
  try {
    const { error } = await client.rpc("admin_set_collection_products", { p_id: id, p_product_ids: [...productIds] });
    return error ? { ok: false, reason: writeError(error.code) } : { ok: true };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

/** Deletes a collection (its pieces stay in the shop); its cover file goes too. */
export async function deleteCollection(
  client: ServerSupabaseClient,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: AdminCollectionWriteError }> {
  try {
    const { data, error } = await client.rpc("admin_delete_collection", { p_id: id });
    if (error) return { ok: false, reason: writeError(error.code) };
    const answer = data as { deleted: boolean; cover_storage_path: string | null };
    if (!answer.deleted) return { ok: false, reason: "notFound" };
    if (answer.cover_storage_path) await removeFile(client, answer.cover_storage_path);
    return { ok: true };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

async function removeFile(client: ServerSupabaseClient, path: string): Promise<void> {
  const removed = await client.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .remove([path])
    .catch((error: unknown) => ({ data: null, error }));
  if (removed.error || removed.data?.length !== 1) console.error("collection cover: file kept", path, removed.error ?? "not found");
}

/**
 * Turns a staged upload (the product photos' pipeline, #18) into the collection's cover: checked, re-encoded
 * without metadata, stored under a new path; the previous cover's file is removed. The staged file is deleted
 * whatever the outcome.
 */
export async function storeCollectionCover(
  client: ServerSupabaseClient,
  { adminId, collectionId, uploadId }: { adminId: string; collectionId: string; uploadId: string },
): Promise<{ ok: true } | { ok: false; reason: UploadError | AdminCollectionWriteError }> {
  const staged = stagedPath(adminId, uploadId);
  try {
    const { data: blob, error } = await client.storage.from(STAGING_BUCKET).download(staged);
    if (error || !blob) return { ok: false, reason: "uploadMissing" };
    const encoded = await encodeForStorage(new Uint8Array(await blob.arrayBuffer()));
    if (!encoded.ok) return encoded;
    const { image } = encoded;
    const storagePath = `collections/${collectionId}/${randomUUID()}.${image.extension}`;
    const upload = await client.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(storagePath, image.bytes, { contentType: image.contentType, upsert: false, cacheControl: "31536000" });
    if (upload.error) return { ok: false, reason: "unexpectedError" };
    const { data: previous, error: rowError } = await client.rpc("admin_set_collection_cover", {
      p_id: collectionId,
      p_storage_path: storagePath,
      p_width: image.width,
      p_height: image.height,
      p_blur_data_url: image.blurDataUrl as string,
    });
    if (rowError) {
      await removeFile(client, storagePath);
      return { ok: false, reason: writeError(rowError.code) };
    }
    if (previous) await removeFile(client, previous);
    return { ok: true };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  } finally {
    await client.storage
      .from(STAGING_BUCKET)
      .remove([staged])
      .catch(() => undefined);
  }
}

/** Removes the cover photo, row first, then its file. */
export async function removeCollectionCover(
  client: ServerSupabaseClient,
  collectionId: string,
): Promise<{ ok: true } | { ok: false; reason: AdminCollectionWriteError }> {
  try {
    const { data: previous, error } = await client.rpc("admin_set_collection_cover", {
      p_id: collectionId,
      // null removes the cover (the function's signature types it as text)
      p_storage_path: null as unknown as string,
      p_width: null as unknown as number,
      p_height: null as unknown as number,
      p_blur_data_url: null as unknown as string,
    });
    if (error) return { ok: false, reason: writeError(error.code) };
    if (previous) await removeFile(client, previous);
    return { ok: true };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}
