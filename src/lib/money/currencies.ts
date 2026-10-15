import type { Locale } from "@/i18n/routing";

// D4: display currencies at launch; others come later as rows of currency_settings plus an entry here
export const currencies = ["UAH", "EUR", "USD", "PLN", "CZK", "RON", "CHF"] as const;

export type Currency = (typeof currencies)[number];

// The currency every price is entered in (D4)
export const BASE_CURRENCY = "USD" satisfies Currency;

// The visitor's choice from the header switcher (D5: a cookie, never the URL)
export const CURRENCY_COOKIE = "TJS_CURRENCY";

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (currencies as readonly string[]).includes(value);
}

// D5: deterministic default per locale, used for crawlers and JSON-LD
export const localeDefaultCurrency: Record<Locale, Currency> = {
  uk: "UAH",
  en: "USD",
  de: "EUR",
  fr: "EUR",
  es: "EUR",
  it: "EUR",
  nl: "EUR",
  pt: "EUR",
  pl: "PLN",
  cs: "CZK",
  ro: "RON",
};

// Member states whose currency is the euro (Bulgaria since 2026-01-01), ISO 3166-1 alpha-2
const EURO_AREA = new Set([
  "AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
]);

const COUNTRY_CURRENCY: Record<string, Currency> = { UA: "UAH", PL: "PLN", CZ: "CZK", RO: "RON", CH: "CHF" };

// D5: the visitor's country (Vercel geo) → currency; null when the country has no currency of its own here
export function currencyForCountry(country: string | null | undefined): Currency | null {
  if (!country) return null;
  const code = country.toUpperCase();
  if (EURO_AREA.has(code)) return "EUR";
  return COUNTRY_CURRENCY[code] ?? null;
}

type CurrencyInputs = {
  // value of the CURRENCY_COOKIE cookie, untrusted
  cookie: string | null | undefined;
  // the x-vercel-ip-country header, untrusted
  country: string | null | undefined;
  locale: Locale;
  // currencies enabled in currency_settings
  enabled: readonly Currency[];
};

// D5 order: the switcher's cookie, then the visitor's country, then the locale default
export function resolveCurrency({ cookie, country, locale, enabled }: CurrencyInputs): Currency {
  const candidates = [isCurrency(cookie) ? cookie : null, currencyForCountry(country), localeDefaultCurrency[locale]];
  for (const candidate of candidates) {
    if (candidate && enabled.includes(candidate)) return candidate;
  }
  return enabled[0] ?? localeDefaultCurrency[locale];
}
