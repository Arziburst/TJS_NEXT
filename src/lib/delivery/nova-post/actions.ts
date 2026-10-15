"use server";

import { z } from "zod";
import { locales } from "@/i18n/routing";
import { allowDeliveryCall } from "@/lib/delivery/rate-limit";
import { BUSINESS_TIME_ZONE } from "@/lib/money/business-date";
import { decimalString, formatMoney } from "@/lib/money/format";
import { getCurrencyChoiceFor } from "@/lib/money/prices";
import { getNovaPostClient } from "./config";
import { DELIVERY_COUNTRIES, hasDivisions } from "./countries";
import { parcelForOrder } from "./parcel";
import { estimateDelivery, type ShownPrice } from "./quote";
import { DIVISION_CATEGORIES, type Division, type Settlement } from "./types";
import { readZoneRates } from "./zone-rates";

// Public entry points of the checkout's delivery step: any visitor, signed in or not, may call them, so
// there is no user or role to check; every input is validated, every client has a budget per minute
// (shared with the Nova Poshta actions, src/lib/delivery/rate-limit.ts) and the API key never leaves the server.

const countrySchema = z.enum(DELIVERY_COUNTRIES);
const localeSchema = z.enum(locales);

const settlementsInput = z.object({
  country: countrySchema.refine(hasDivisions),
  text: z.string().trim().min(2).max(100),
  locale: localeSchema,
});

const divisionsInput = z.object({
  country: countrySchema.refine(hasDivisions),
  settlementId: z.number().int().positive(),
  categories: z.array(z.enum(DIVISION_CATEGORIES)).min(1).max(DIVISION_CATEGORIES.length),
  locale: localeSchema,
});

// Field lengths follow the API's addressParts limits
const destinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("division"), divisionId: z.number().int().positive() }),
  z.object({
    kind: z.literal("address"),
    city: z.string().trim().min(1).max(100),
    postCode: z.string().trim().min(2).max(10),
    street: z.string().trim().min(1).max(100),
    building: z.string().trim().min(1).max(100),
    flat: z.string().trim().max(10).optional(),
  }),
]);

/*
 * The goods of the order the estimate is for (weight and UAH total, from the server-side cart through the
 * page; ./parcel goodsOf). They only shape an estimate the customer sees (D37: the actual price is paid at the
 * post office), so a tampered value misleads nobody but the sender; the bounds keep the API request sane.
 */
const goodsSchema = z
  .object({
    weightGrams: z.number().int().min(0).max(30_000),
    totalUahMinor: z.number().int().min(0).max(100_000_000),
  })
  .nullable();

const estimateInput = z
  .object({ country: countrySchema, destination: destinationSchema, goods: goodsSchema, locale: localeSchema })
  .refine((input) => input.destination.kind === "address" || hasDivisions(input.country), { path: ["destination"] });

type Refusal = { ok: false; reason: "invalid" | "rateLimited" };

export type LookupFailure = { ok: false; reason: "unavailable" } | Refusal;

export type SettlementsResult = { ok: true; settlements: Settlement[] } | LookupFailure;

export async function searchNovaPostSettlements(input: unknown): Promise<SettlementsResult> {
  const parsed = settlementsInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (!(await allowDeliveryCall("search"))) return { ok: false, reason: "rateLimited" };
  const client = getNovaPostClient();
  if (!client) return { ok: false, reason: "unavailable" };
  const { country, text, locale } = parsed.data;
  const result = await client.searchSettlements(country, text, locale);
  if (!result.ok) {
    console.error("delivery: Nova Post settlements failed", result.error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, settlements: result.data };
}

export type DivisionsResult = { ok: true; divisions: Division[] } | LookupFailure;

export async function listNovaPostDivisions(input: unknown): Promise<DivisionsResult> {
  const parsed = divisionsInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (!(await allowDeliveryCall("search"))) return { ok: false, reason: "rateLimited" };
  const client = getNovaPostClient();
  if (!client) return { ok: false, reason: "unavailable" };
  const { country, settlementId, categories, locale } = parsed.data;
  const result = await client.listDivisions(country, settlementId, categories, locale);
  if (!result.ok) {
    console.error("delivery: Nova Post divisions failed", result.error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, divisions: result.data };
}

// What the quote line shows, formatted on the server for the visitor's locale and currency
export type QuoteView = {
  source: "carrier" | "flatRate";
  price: { state: "amount"; text: string; value: string; currency: string } | { state: "tbd" } | { state: "unavailable" };
  // the scheduled delivery date in the visitor's locale, null when unknown
  deliveryDate: string | null;
};

export type EstimateResult = { ok: true; quote: QuoteView } | Refusal;

function priceView(price: ShownPrice, locale: string): QuoteView["price"] {
  if (price.state !== "amount") return price;
  return {
    state: "amount",
    text: formatMoney(price.money, locale),
    value: decimalString(price.money),
    currency: price.money.currency,
  };
}

function dateView(isoDate: string | null, locale: string): string | null {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: BUSINESS_TIME_ZONE }).format(date);
}

export async function estimateNovaPostDelivery(input: unknown): Promise<EstimateResult> {
  const parsed = estimateInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (!(await allowDeliveryCall("quote"))) return { ok: false, reason: "rateLimited" };
  const { country, destination, goods, locale } = parsed.data;
  const { current, tables } = await getCurrencyChoiceFor(locale);
  const estimate = await estimateDelivery(
    { country, destination, currency: current },
    { client: getNovaPostClient(), parcel: parcelForOrder(goods), zoneRates: readZoneRates, tables },
  );
  return {
    ok: true,
    quote: {
      source: estimate.source,
      price: priceView(estimate.price, locale),
      deliveryDate: estimate.source === "carrier" ? dateView(estimate.scheduledDeliveryDate, locale) : null,
    },
  };
}
