import "server-only";

import type { Locale } from "@/i18n/routing";
import { getAdmin } from "@/lib/auth/session";
import { isLocale } from "@/lib/catalog/mappers";
import { createServiceClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import type { VariantInput, VariantLabelSource } from "./variant-form";

/*
 * The admin's sizes of a product (#66). The read goes through the service role (it needs to know which sizes were
 * ordered, which the order tables show only to their customer) after the admin check; the writes go through the
 * admin's session to the admin functions, which check the role again.
 */

export type AdminVariant = {
  id: string;
  labels: Partial<Record<Locale, string>>;
  skuSuffix: string | null;
  priceDeltaUsdMinor: number;
  available: boolean;
  /** An ordered size cannot be deleted (the order lines link to it), only switched off. */
  ordered: boolean;
};

export type AdminVariantsResult = { ok: true; variants: AdminVariant[] } | { ok: false; reason: "notAuthorized" | "unexpectedError" };

/** The live sizes of a product in the owner's order, with their labels in every locale. */
export async function getAdminVariants(productId: string): Promise<AdminVariantsResult> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  try {
    const client = createServiceClient();
    const { data, error } = await client
      .from("product_variants")
      .select("id, position, sku_suffix, price_delta_usd_minor, is_available, product_variant_translations(locale, label)")
      .eq("product_id", productId)
      .is("deleted_at", null)
      .order("position")
      .order("id");
    if (error) return { ok: false, reason: "unexpectedError" };

    const ordered = new Set<string>();
    if (data.length > 0) {
      const lines = await client
        .from("order_items")
        .select("variant_id")
        .in("variant_id", data.map((row) => row.id));
      if (lines.error) return { ok: false, reason: "unexpectedError" };
      for (const line of lines.data) if (line.variant_id) ordered.add(line.variant_id);
    }

    return {
      ok: true,
      variants: data.map((row) => ({
        id: row.id,
        labels: Object.fromEntries(
          row.product_variant_translations.filter((t) => isLocale(t.locale)).map((t) => [t.locale, t.label]),
        ),
        skuSuffix: row.sku_suffix,
        priceDeltaUsdMinor: row.price_delta_usd_minor,
        available: row.is_available,
        ordered: ordered.has(row.id),
      })),
    };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

/** The sizes' price differences of every product among `ids`: the admin list's count, the product save's check. */
export async function getVariantDeltas(ids: readonly string[]): Promise<Map<string, number[]> | null> {
  const deltas = new Map<string, number[]>();
  if (ids.length === 0) return deltas;
  try {
    const { data, error } = await createServiceClient()
      .from("product_variants")
      .select("product_id, price_delta_usd_minor")
      .in("product_id", [...new Set(ids)])
      .is("deleted_at", null);
    if (error) return null;
    for (const row of data) deltas.set(row.product_id, [...(deltas.get(row.product_id) ?? []), row.price_delta_usd_minor]);
    return deltas;
  } catch {
    return null;
  }
}

export type VariantWriteError =
  | "notAuthorized"
  | "notFound"
  | "conflict"
  | "ordered"
  | "tooMany"
  | "oneOfAKind"
  | "suffixTaken"
  | "unexpectedError";

function writeError(code: string | undefined): VariantWriteError {
  switch (code) {
    case "42501":
      return "notAuthorized";
    case "P0002":
      return "notFound";
    case "40001":
      return "conflict";
    case "23503":
      return "ordered";
    case "54000":
      return "tooMany";
    case "23505":
      return "suffixTaken";
    // the one-of-a-kind rule; the price rule is checked with a field error before the write
    case "23514":
      return "oneOfAKind";
    default:
      return "unexpectedError";
  }
}

export type VariantWriteResult = { ok: true } | { ok: false; reason: VariantWriteError };

async function call(run: () => PromiseLike<{ data: unknown; error: { code?: string } | null }>): Promise<VariantWriteResult & { data?: unknown }> {
  try {
    const { data, error } = await run();
    if (error) return { ok: false, reason: writeError(error.code) };
    return { ok: true, data };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

/** The stored labels of one live size of the product, with their source (a save keeps it, #102); null when unreadable. */
export async function getStoredVariantLabels(
  productId: string,
  variantId: string,
): Promise<{ locale: string; label: string; source: VariantLabelSource }[] | "notFound" | null> {
  try {
    const { data, error } = await createServiceClient()
      .from("product_variants")
      .select("id, product_variant_translations(locale, label, source)")
      .eq("id", variantId)
      .eq("product_id", productId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return null;
    if (!data) return "notFound";
    return data.product_variant_translations;
  } catch {
    return null;
  }
}

/** Creates (`variantId` null: as the last size) or updates a size with its labels. */
export async function saveVariant(
  client: ServerSupabaseClient,
  { productId, variantId, input, available }: { productId: string; variantId: string | null; input: VariantInput; available: boolean },
): Promise<VariantWriteResult> {
  const result = await call(() =>
    client.rpc("admin_save_product_variant", {
      p_product_id: productId,
      // a new size has no id yet; the function inserts it
      p_variant_id: variantId as string,
      p_variant: { sku_suffix: input.sku_suffix, price_delta_usd_minor: input.price_delta_usd_minor, is_available: available },
      p_labels: input.labels,
    }),
  );
  return result.ok ? { ok: true } : result;
}

/** Switches a size on (it can be ordered) or off (shown, not orderable). */
export async function setVariantAvailable(
  client: ServerSupabaseClient,
  { productId, variantId, available }: { productId: string; variantId: string; available: boolean },
): Promise<VariantWriteResult> {
  const result = await call(() =>
    client.rpc("admin_set_product_variant_available", { p_product_id: productId, p_variant_id: variantId, p_available: available }),
  );
  if (!result.ok) return result;
  return result.data === true ? { ok: true } : { ok: false, reason: "notFound" };
}

/** The new order of all the product's sizes. */
export async function reorderVariants(
  client: ServerSupabaseClient,
  { productId, variantIds }: { productId: string; variantIds: string[] },
): Promise<VariantWriteResult> {
  const result = await call(() => client.rpc("admin_reorder_product_variants", { p_product_id: productId, p_variant_ids: variantIds }));
  return result.ok ? { ok: true } : result;
}

/** Deletes a size nobody ordered (a soft delete; carts that hold it show it as no longer available). */
export async function deleteVariant(
  client: ServerSupabaseClient,
  { productId, variantId }: { productId: string; variantId: string },
): Promise<VariantWriteResult> {
  const result = await call(() => client.rpc("admin_delete_product_variant", { p_product_id: productId, p_variant_id: variantId }));
  if (!result.ok) return result;
  return result.data === true ? { ok: true } : { ok: false, reason: "notFound" };
}
