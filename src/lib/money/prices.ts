import "server-only";
import { hasLocale } from "next-intl";
import { getLocale } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { routing, type Locale } from "@/i18n/routing";
import { getMoneyTables } from "./cache";
import { CURRENCY_COOKIE, currencies, localeDefaultCurrency, resolveCurrency, type Currency } from "./currencies";
import { decimalString, formatMoney, priceIn, type Money } from "./format";
import type { MoneyTables } from "./store";

// Vercel sets the visitor's country on every request
const COUNTRY_HEADER = "x-vercel-ip-country";

function enabledCurrencies(tables: MoneyTables | null): Currency[] {
  if (!tables) return [...currencies];
  return currencies.filter((currency) => tables.settings[currency]?.enabled);
}

export type CurrencyChoice = { current: Currency; options: Currency[] };

// The visitor's currency (D5): switcher cookie, then Vercel geo, then the locale default. Request-time data:
// render its callers inside <Suspense>.
export async function getCurrencyChoice(): Promise<CurrencyChoice> {
  return (await visitorContext()).choice;
}

async function visitorContext() {
  // request data first: a prerender stops here, so the build never reads the database
  const [cookieStore, headerList, requested] = await Promise.all([cookies(), headers(), getLocale()]);
  const tables = await getMoneyTables();
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const options = enabledCurrencies(tables);
  const current = resolveCurrency({
    cookie: cookieStore.get(CURRENCY_COOKIE)?.value,
    country: headerList.get(COUNTRY_HEADER),
    locale,
    enabled: options,
  });
  return { choice: { current, options }, locale, tables };
}

export type FormattedPrice = Money & { text: string };

// A USD price in the visitor's currency, formatted for their locale; null when no rate is available.
// Request-time data: render its callers inside <Suspense>.
export async function formatPrice(usdMinor: number): Promise<FormattedPrice | null> {
  const { choice, locale, tables } = await visitorContext();
  if (!tables) return null;
  const money = priceIn(usdMinor, choice.current, tables);
  return money && { ...money, text: formatMoney(money, locale) };
}

export type JsonLdPrice = { price: string; priceCurrency: Currency };

// schema.org Offer price in the locale's default currency (D5), the same for every visitor and crawler
export async function getJsonLdPrice(usdMinor: number, locale: Locale): Promise<JsonLdPrice | null> {
  const tables = await getMoneyTables();
  if (!tables) return null;
  const money = priceIn(usdMinor, localeDefaultCurrency[locale], tables);
  return money && { price: decimalString(money), priceCurrency: money.currency };
}
