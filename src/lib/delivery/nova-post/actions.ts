"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { locales, type Locale } from "@/i18n/routing";
import { BUSINESS_TIME_ZONE } from "@/lib/money/business-date";
import { getMoneyTables } from "@/lib/money/cache";
import { CURRENCY_COOKIE, currencies, resolveCurrency, type Currency } from "@/lib/money/currencies";
import { decimalString, formatMoney } from "@/lib/money/format";
import type { MoneyTables } from "@/lib/money/store";
import { getNovaPostClient } from "./config";
import { DELIVERY_COUNTRIES, hasDivisions } from "./countries";
import { parcelForOrder } from "./parcel";
import { estimateDelivery, type ShownPrice } from "./quote";
import { DIVISION_CATEGORIES, type Division, type Settlement } from "./types";
import { readZoneRates } from "./zone-rates";

// Public entry points of the checkout's delivery step: any visitor, signed in or not, may call them, so
// there is no user or role to check; every input is validated and the API key never leaves the server.

// Vercel sets the visitor's country on every request (the same header src/lib/money/prices.ts reads)
const COUNTRY_HEADER = "x-vercel-ip-country";

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

const estimateInput = z
  .object({ country: countrySchema, destination: destinationSchema, locale: localeSchema })
  .refine((input) => input.destination.kind === "address" || hasDivisions(input.country), { path: ["destination"] });

export type LookupFailure = { ok: false; reason: "invalid" | "unavailable" };

export type SettlementsResult = { ok: true; settlements: Settlement[] } | LookupFailure;

export async function searchNovaPostSettlements(input: unknown): Promise<SettlementsResult> {
  const parsed = settlementsInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
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

export type EstimateResult = { ok: true; quote: QuoteView } | { ok: false; reason: "invalid" };

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

/*
 * The visitor's display currency by D5 (switcher cookie, Vercel geo, locale default), as the header shows it.
 * getCurrencyChoice() cannot run here: it reads the route's locale, which a Server Action does not have, so
 * the action takes the locale as validated input.
 */
async function displayCurrency(locale: Locale, tables: MoneyTables | null): Promise<Currency> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const enabled = tables ? currencies.filter((currency) => tables.settings[currency]?.enabled) : [...currencies];
  return resolveCurrency({
    cookie: cookieStore.get(CURRENCY_COOKIE)?.value,
    country: headerList.get(COUNTRY_HEADER),
    locale,
    enabled,
  });
}

export async function estimateNovaPostDelivery(input: unknown): Promise<EstimateResult> {
  const parsed = estimateInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { country, destination, locale } = parsed.data;
  const tables = await getMoneyTables();
  const current = await displayCurrency(locale, tables);
  const estimate = await estimateDelivery(
    { country, destination, currency: current },
    { client: getNovaPostClient(), parcel: parcelForOrder(), zoneRates: readZoneRates, tables },
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
