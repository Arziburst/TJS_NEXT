import "server-only";

import { getAdmin } from "@/lib/auth/session";
import { createServiceClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import { saleState, type AdminSale, type SaleTarget, type SaleWrite } from "./sale-form";

/*
 * The admin's sales (#67): a product's and a collection's. The read goes through the service role after the admin
 * check (the public sees only running sales); the writes through the admin's session as plain rows, which RLS
 * limits to admins and the audit trigger attributes.
 */

export type SaleWriteError = "notAuthorized" | "notFound" | "unexpectedError";

type SaleRow = { percent_off: number | null; price_usd_minor?: number | null; starts_at: string | null; ends_at: string | null };

function toAdminSale(row: SaleRow): AdminSale {
  return {
    kind: row.percent_off !== null ? "percent" : "price",
    percentOff: row.percent_off,
    priceUsdMinor: row.price_usd_minor ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    state: saleState({ startsAt: row.starts_at, endsAt: row.ends_at }, Date.now()),
  };
}

/** The sale of a product or a collection, null without one; undefined when it could not be read. */
export async function getAdminSale(target: SaleTarget, id: string): Promise<AdminSale | null | undefined> {
  if (!(await getAdmin())) return undefined;
  try {
    const client = createServiceClient();
    const { data, error } =
      target === "product"
        ? await client.from("product_sales").select("percent_off, price_usd_minor, starts_at, ends_at").eq("product_id", id).maybeSingle()
        : await client.from("collection_sales").select("percent_off, starts_at, ends_at").eq("collection_id", id).maybeSingle();
    if (error) return undefined;
    return data ? toAdminSale(data) : null;
  } catch {
    return undefined;
  }
}

function writeError(code: string | undefined): SaleWriteError {
  if (code === "42501") return "notAuthorized";
  // the product or collection is gone (foreign key)
  if (code === "23503") return "notFound";
  return "unexpectedError";
}

/** Starts or changes the sale of a product or a collection (one per target). */
export async function saveSale(
  client: ServerSupabaseClient,
  target: SaleTarget,
  id: string,
  sale: SaleWrite,
): Promise<{ ok: true } | { ok: false; reason: SaleWriteError }> {
  try {
    const { error } =
      target === "product"
        ? await client.from("product_sales").upsert({ product_id: id, ...sale }, { onConflict: "product_id" })
        : await client.from("collection_sales").upsert(
            { collection_id: id, percent_off: sale.percent_off ?? 0, starts_at: sale.starts_at, ends_at: sale.ends_at },
            { onConflict: "collection_id" },
          );
    return error ? { ok: false, reason: writeError(error.code) } : { ok: true };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

/** Ends a sale now: the regular prices apply again. */
export async function removeSale(
  client: ServerSupabaseClient,
  target: SaleTarget,
  id: string,
): Promise<{ ok: true } | { ok: false; reason: SaleWriteError }> {
  try {
    const { error } =
      target === "product"
        ? await client.from("product_sales").delete().eq("product_id", id)
        : await client.from("collection_sales").delete().eq("collection_id", id);
    return error ? { ok: false, reason: writeError(error.code) } : { ok: true };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}
