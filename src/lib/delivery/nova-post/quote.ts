import type { Currency } from "@/lib/money/currencies";
import { isCurrency } from "@/lib/money/currencies";
import type { Money } from "@/lib/money/format";
import type { MoneyTables } from "@/lib/money/store";
import type { NovaPostClient } from "./client";
import { zoneOf, type DeliveryCountry, type DeliveryZone } from "./countries";
import { deliveryPriceIn } from "./convert";
import type { ZoneRates } from "./zone-rates";
import type { CarrierMoney, Destination, NovaPostFailure, Parcel } from "./types";

// A price to show: an amount, "TBD" (the owner has not set the flat rate) or unavailable (no rate to convert)
export type ShownPrice = { state: "amount"; money: Money } | { state: "tbd" } | { state: "unavailable" };

// Why the flat rate stands in for a live quote
export type FallbackReason =
  // NOVA_POST_API_KEY is not set
  | "notConfigured"
  // the parcel rules (packaging, declared value) are TBD
  | "parcelTbd"
  // the API failed or refused to quote
  | "carrierFailed"
  // the API quoted in a currency the shop does not show
  | "carrierCurrency";

export type DeliveryEstimate =
  | {
      source: "carrier";
      zone: DeliveryZone;
      price: ShownPrice;
      carrierPrice: CarrierMoney;
      // ISO 8601 date-time from the API, null when it cannot schedule the route
      scheduledDeliveryDate: string | null;
    }
  // an estimate by the zone's flat rate, always marked as such
  | { source: "flatRate"; zone: DeliveryZone; price: ShownPrice; reason: FallbackReason; failure?: NovaPostFailure };

export type EstimateInput = { country: DeliveryCountry; destination: Destination; currency: Currency };

export type EstimateDeps = {
  client: NovaPostClient | null;
  parcel: Parcel | null;
  zoneRates: () => Promise<ZoneRates>;
  // null when the rates cannot be read: every price is then unavailable
  tables: MoneyTables | null;
};

function shown(price: CarrierMoney, currency: Currency, tables: MoneyTables | null): ShownPrice {
  const money = tables && deliveryPriceIn(price, currency, tables);
  return money ? { state: "amount", money } : { state: "unavailable" };
}

async function flatRate(
  input: EstimateInput,
  deps: EstimateDeps,
  reason: FallbackReason,
  failure?: NovaPostFailure,
): Promise<DeliveryEstimate> {
  const zone = zoneOf(input.country);
  let price: ShownPrice;
  try {
    const rate = (await deps.zoneRates())[zone];
    price = rate ? shown(rate, input.currency, deps.tables) : { state: "tbd" };
  } catch (error) {
    console.error("delivery: zone rates unavailable", error);
    price = { state: "unavailable" };
  }
  return failure ? { source: "flatRate", zone, price, reason, failure } : { source: "flatRate", zone, price, reason };
}

/**
 * The delivery estimate for a destination abroad, in the visitor's display currency: Nova Post's live
 * calculation when the API is configured and a parcel is known, else the zone's flat rate marked as an
 * estimate. Never throws.
 */
export async function estimateDelivery(input: EstimateInput, deps: EstimateDeps): Promise<DeliveryEstimate> {
  if (!deps.client) return flatRate(input, deps, "notConfigured");
  if (!deps.parcel) return flatRate(input, deps, "parcelTbd");

  const result = await deps.client.calculate({ country: input.country, destination: input.destination, parcel: deps.parcel });
  if (!result.ok) {
    console.error("delivery: Nova Post calculation failed", result.error);
    return flatRate(input, deps, "carrierFailed", result.error);
  }
  const { price, scheduledDeliveryDate } = result.data;
  if (!isCurrency(price.currency)) return flatRate(input, deps, "carrierCurrency");
  return {
    source: "carrier",
    zone: zoneOf(input.country),
    price: shown(price, input.currency, deps.tables),
    carrierPrice: price,
    scheduledDeliveryDate,
  };
}
