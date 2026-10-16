import "server-only";

import type { DeliveryChoice } from "@/lib/checkout/schema";
import type { Json } from "@/lib/supabase/database.types";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { parseStoredChoice } from "./order-delivery";
import { countryOf } from "./schemas";

// The customer's saved delivery destinations (public.saved_addresses), each a checkout delivery choice.
// Reads and writes go through the customer's session client: RLS keeps every customer to their own rows, and
// the database keeps the limit and the one default.

export type SavedAddress = {
  id: string;
  label: string | null;
  country: string;
  delivery: DeliveryChoice;
  isDefault: boolean;
};

export type ListAddressesResult = { ok: true; addresses: SavedAddress[] } | { ok: false };

/** The user's own addresses, the default first, then oldest first. */
export async function listSavedAddresses(client: ServerSupabaseClient): Promise<ListAddressesResult> {
  const { data, error } = await client
    .from("saved_addresses")
    .select("id, label, country, delivery, is_default")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("account: saved addresses read failed", error);
    return { ok: false };
  }
  const addresses: SavedAddress[] = [];
  for (const row of data) {
    // a row the current schema no longer accepts is left out, never handed to the checkout
    const delivery = parseStoredChoice(row.delivery);
    if (!delivery) {
      console.error("account: a saved address does not match the delivery schema", row.id);
      continue;
    }
    addresses.push({ id: row.id, label: row.label, country: row.country, delivery, isDefault: row.is_default });
  }
  return { ok: true, addresses };
}

export type AddressWriteResult = { ok: true } | { ok: false; reason: "limitReached" | "notFound" | "unexpectedError" };

// the saved_addresses trigger's refusal of one address too many
const LIMIT_REACHED = "TJ429";

export async function createSavedAddress(
  client: ServerSupabaseClient,
  address: { label: string | null; delivery: DeliveryChoice },
): Promise<AddressWriteResult> {
  const { error } = await client.from("saved_addresses").insert({
    label: address.label,
    country: countryOf(address.delivery),
    delivery: address.delivery as unknown as NonNullable<Json>,
  });
  if (!error) return { ok: true };
  if (error.code === LIMIT_REACHED) return { ok: false, reason: "limitReached" };
  console.error("account: saving an address failed", error);
  return { ok: false, reason: "unexpectedError" };
}

export async function makeDefaultAddress(client: ServerSupabaseClient, id: string): Promise<AddressWriteResult> {
  const { data, error } = await client.from("saved_addresses").update({ is_default: true }).eq("id", id).select("id");
  if (error) {
    console.error("account: setting the default address failed", error);
    return { ok: false, reason: "unexpectedError" };
  }
  return data.length === 1 ? { ok: true } : { ok: false, reason: "notFound" };
}

export async function deleteSavedAddress(client: ServerSupabaseClient, id: string): Promise<AddressWriteResult> {
  const { data, error } = await client.from("saved_addresses").delete().eq("id", id).select("id");
  if (error) {
    console.error("account: deleting an address failed", error);
    return { ok: false, reason: "unexpectedError" };
  }
  return data.length === 1 ? { ok: true } : { ok: false, reason: "notFound" };
}
