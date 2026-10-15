import { convertUsd, type CurrencySettings } from "./convert";
import { BASE_CURRENCY, type Currency } from "./currencies";

export type Money = { currency: Currency; amountMinor: number; decimals: number };

type PriceTables = {
  settings: Partial<Record<Currency, CurrencySettings>>;
  displayRates: Partial<Record<Currency, { rate: string }>>;
};

// A USD price shown in `currency`, or null when that currency has no settings or no display rate yet
export function priceIn(usdMinor: number, currency: Currency, tables: PriceTables): Money | null {
  const settings = tables.settings[currency];
  const rate = currency === BASE_CURRENCY ? "1" : tables.displayRates[currency]?.rate;
  if (!settings || !rate) return null;
  return { currency, amountMinor: convertUsd(usdMinor, rate, settings), decimals: settings.decimals };
}

// The local symbol (₴, zł, Kč, lei), except a bare letter some locales give (RON "L" in de, fr, cs): then the code
function currencyDisplay(currency: Currency, locale: string): "narrowSymbol" | "symbol" {
  const narrow = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol" })
    .formatToParts(0)
    .find((part) => part.type === "currency")?.value;
  return narrow && /^[A-Za-z]$/.test(narrow) ? "symbol" : "narrowSymbol";
}

// The symbol a price in `currency` shows in `locale`
export function currencySymbol(currency: Currency, locale: string): string {
  return (
    new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: currencyDisplay(currency, locale) })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency
  );
}

// 29.90 € / €29.90 / 1 289 ₴ per locale; a whole charm price drops its zero fraction (€129, not €129.00)
export function formatMoney({ currency, amountMinor, decimals }: Money, locale: string): string {
  const fractionDigits = amountMinor % 10 ** decimals === 0 ? 0 : decimals;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: currencyDisplay(currency, locale),
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amountMinor / 10 ** decimals);
}

// "29.90" for schema.org Offer.price: a dot, every decimal place, no grouping
export function decimalString({ amountMinor, decimals }: Money): string {
  if (decimals === 0) return String(amountMinor);
  const digits = String(amountMinor).padStart(decimals + 1, "0");
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}
