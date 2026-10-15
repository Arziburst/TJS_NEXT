import "server-only";
import { createPublicServerClient } from "@/lib/supabase/server";
import { DELIVERY_ZONES, type DeliveryZone } from "./countries";
import type { CarrierMoney } from "./types";

// A zone's flat rate, or null while the owner has not set it (TBD)
export type ZoneRates = Record<DeliveryZone, CarrierMoney | null>;

function isZone(value: string): value is DeliveryZone {
  return (DELIVERY_ZONES as readonly string[]).includes(value);
}

/**
 * The flat rates of nova_post_zone_rates, read under RLS as a visitor. Throws when the database is not
 * configured or unreachable; a zone without a row counts as TBD.
 */
export async function readZoneRates(): Promise<ZoneRates> {
  const { data, error } = await createPublicServerClient()
    .from("nova_post_zone_rates")
    .select("zone, amount_minor, currency");
  if (error) throw new Error(`nova_post_zone_rates: ${error.message}`);
  const rates: ZoneRates = { A: null, B: null, C: null };
  for (const row of data) {
    if (!isZone(row.zone)) continue;
    rates[row.zone] =
      row.amount_minor !== null && row.currency !== null ? { currency: row.currency, amountMinor: row.amount_minor } : null;
  }
  return rates;
}
