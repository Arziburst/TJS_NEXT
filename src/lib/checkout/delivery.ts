import { parcelFromCart, type RecipientService } from "@/lib/delivery/nova-poshta/parcel";
import type { QuoteResult as NovaPoshtaQuote } from "@/lib/delivery/nova-poshta/types";
import { goodsOf, parcelForOrder } from "@/lib/delivery/nova-post/parcel";
import type { DeliveryEstimate, EstimateInput } from "@/lib/delivery/nova-post/quote";
import type { Destination, Parcel as NovaPostParcel } from "@/lib/delivery/nova-post/types";
import type { DeliveryCountry } from "@/lib/delivery/nova-post/countries";
import { isCurrency, type Currency } from "@/lib/money/currencies";
import { priceIn } from "@/lib/money/format";
import type { MoneyTables } from "@/lib/money/store";
import type { Quote } from "./quote";
import type { DeliveryChoice } from "./schema";

// The delivery part of an order request: where it goes (as stored on the order) and the estimate, computed on
// the server from the order's own goods (weight and UAH value, D35/D37) with the carriers' pieces of #22/#23.
// The client's parcel or goods are never used. Every amount is an estimate the customer pays to the carrier on
// receipt (D35, D38): it is shown and stored, never added to what the shop asks for.

/** Nova Poshta prices in kopiykas (2 decimals), whatever the shop's UAH display settings. */
const NOVA_POSHTA_DECIMALS = 2;

export type DeliveryRecord = {
  country: "UA" | DeliveryCountry;
  carrier: "nova_poshta" | "nova_post";
  method: "warehouse" | "postomat" | "doors" | "division" | "address";
  // orders.delivery_destination: the choice as the owner needs it to ship
  destination: Record<string, unknown>;
};

export function deliveryRecord(choice: DeliveryChoice): DeliveryRecord {
  switch (choice.kind) {
    case "novaPoshtaWarehouse":
      return {
        country: "UA",
        carrier: "nova_poshta",
        method: choice.warehouse.kind === "postomat" ? "postomat" : "warehouse",
        destination: { city: choice.city, warehouse: choice.warehouse },
      };
    case "novaPoshtaAddress":
      return {
        country: "UA",
        carrier: "nova_poshta",
        method: "doors",
        destination: { city: choice.city, street: choice.street, house: choice.house, flat: choice.flat },
      };
    case "novaPostDivision":
      return {
        country: choice.country,
        carrier: "nova_post",
        method: "division",
        destination: { settlement: choice.settlement, division: choice.division },
      };
    case "novaPostAddress":
      return {
        country: choice.country,
        carrier: "nova_post",
        method: "address",
        destination: {
          city: choice.city,
          postCode: choice.postCode,
          street: choice.street,
          building: choice.building,
          flat: choice.flat,
        },
      };
  }
}

export type DeliveryEstimateRecord =
  | { state: "amount"; source: "carrier" | "flat_rate"; amountMinor: number; currency: Currency; decimals: number }
  | { state: "tbd"; source: "flat_rate" }
  | { state: "unavailable"; source: "carrier" | "flat_rate" | null };

export type DeliveryDeps = {
  tables: MoneyTables | null;
  // Nova Poshta's tariff (src/lib/delivery/nova-poshta/quote.ts)
  quoteNovaPoshta: (input: {
    cityRef: string;
    recipient: RecipientService;
    parcel: { weightGrams: number; declaredValueMinor: number };
  }) => Promise<NovaPoshtaQuote>;
  // Nova Post's estimate or the zone flat rate (src/lib/delivery/nova-post/quote.ts)
  estimateNovaPost: (input: EstimateInput, parcel: NovaPostParcel | null, tables: MoneyTables | null) => Promise<DeliveryEstimate>;
};

const UNAVAILABLE: DeliveryEstimateRecord = { state: "unavailable", source: null };

/** The UAH parcel of the order for Nova Poshta: the goods' weight plus the box and their UAH value (D35, D37). */
function novaPoshtaParcel(quote: Quote, tables: MoneyTables | null) {
  if (!tables) return null;
  const lines = [];
  for (const line of quote.lines) {
    const uah = priceIn(line.priceUsdMinor, "UAH", tables);
    if (!uah) return null;
    lines.push({ weightGrams: line.weightGrams, quantity: line.quantity, unitPriceUahMinor: uah.amountMinor });
  }
  return parcelFromCart(lines);
}

function novaPostDestination(choice: Extract<DeliveryChoice, { kind: "novaPostDivision" | "novaPostAddress" }>): Destination {
  if (choice.kind === "novaPostDivision") return { kind: "division", divisionId: choice.division.id };
  const { city, postCode, street, building, flat } = choice;
  return { kind: "address", city, postCode, street, building, ...(flat ? { flat } : {}) };
}

/** The delivery estimate of an order request; never throws (a failed quote is stored as unavailable). */
export async function estimateForOrder(choice: DeliveryChoice, quote: Quote, deps: DeliveryDeps): Promise<DeliveryEstimateRecord> {
  try {
    if (choice.kind === "novaPoshtaWarehouse" || choice.kind === "novaPoshtaAddress") {
      const parcel = novaPoshtaParcel(quote, deps.tables);
      if (!parcel) return UNAVAILABLE;
      const recipient: RecipientService =
        choice.kind === "novaPoshtaAddress" ? "doors" : choice.warehouse.kind === "postomat" ? "postomat" : "warehouse";
      const result = await deps.quoteNovaPoshta({ cityRef: choice.city.cityRef, recipient, parcel });
      if (!result.ok || !Number.isSafeInteger(result.costMinor) || result.costMinor < 0) return { state: "unavailable", source: "carrier" };
      return { state: "amount", source: "carrier", amountMinor: result.costMinor, currency: "UAH", decimals: NOVA_POSHTA_DECIMALS };
    }

    const goods = deps.tables ? goodsOf(quote.lines, deps.tables) : null;
    const estimate = await deps.estimateNovaPost(
      { country: choice.country, destination: novaPostDestination(choice), currency: quote.currency },
      parcelForOrder(goods),
      deps.tables,
    );
    const source = estimate.source === "carrier" ? "carrier" : "flat_rate";
    const { price } = estimate;
    if (price.state === "tbd") return { state: "tbd", source: "flat_rate" };
    if (price.state === "unavailable" || !isCurrency(price.money.currency)) return { state: "unavailable", source };
    return { state: "amount", source, amountMinor: price.money.amountMinor, currency: price.money.currency, decimals: price.money.decimals };
  } catch (error) {
    console.error("checkout: delivery estimate failed", error);
    return UNAVAILABLE;
  }
}
