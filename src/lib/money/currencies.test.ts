import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/routing";
import { currencies, currencyForCountry, isCurrency, localeDefaultCurrency, resolveCurrency } from "./currencies";

describe("currencyForCountry (D5)", () => {
  it.each([
    ["UA", "UAH"],
    ["PL", "PLN"],
    ["CZ", "CZK"],
    ["RO", "RON"],
    ["CH", "CHF"],
    ["DE", "EUR"],
    ["FR", "EUR"],
    ["HR", "EUR"],
    ["BG", "EUR"],
    ["ie", "EUR"],
  ])("%s → %s", (country, currency) => {
    expect(currencyForCountry(country)).toBe(currency);
  });

  it.each(["US", "GB", "HU", "SE", "DK", "AD", "", null, undefined])("%s has no currency of its own", (country) => {
    expect(currencyForCountry(country)).toBeNull();
  });

  it("covers the 21 euro-area countries", () => {
    const euroArea = ["AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];
    expect(euroArea.map(currencyForCountry)).toEqual(euroArea.map(() => "EUR"));
  });
});

describe("localeDefaultCurrency (D5)", () => {
  it("has a supported default for every locale", () => {
    for (const locale of locales) expect(isCurrency(localeDefaultCurrency[locale])).toBe(true);
  });

  it("matches D5", () => {
    expect(localeDefaultCurrency).toEqual({
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
    });
  });
});

describe("resolveCurrency", () => {
  const enabled = currencies;

  it("prefers the switcher's cookie", () => {
    expect(resolveCurrency({ cookie: "PLN", country: "UA", locale: "uk", enabled })).toBe("PLN");
  });

  it("falls back to the visitor's country", () => {
    expect(resolveCurrency({ cookie: undefined, country: "CH", locale: "de", enabled })).toBe("CHF");
    expect(resolveCurrency({ cookie: undefined, country: "AT", locale: "en", enabled })).toBe("EUR");
  });

  it("falls back to the locale default without a cookie or a known country", () => {
    expect(resolveCurrency({ cookie: null, country: "US", locale: "de", enabled })).toBe("EUR");
    expect(resolveCurrency({ cookie: null, country: null, locale: "en", enabled })).toBe("USD");
    expect(resolveCurrency({ cookie: null, country: null, locale: "cs", enabled })).toBe("CZK");
  });

  it("ignores a forged or unknown cookie", () => {
    expect(resolveCurrency({ cookie: "GBP", country: null, locale: "pl", enabled })).toBe("PLN");
    expect(resolveCurrency({ cookie: "<script>", country: "RO", locale: "en", enabled })).toBe("RON");
  });

  it("skips a currency disabled in the settings", () => {
    const withoutChf = currencies.filter((c) => c !== "CHF");
    expect(resolveCurrency({ cookie: "CHF", country: "CH", locale: "fr", enabled: withoutChf })).toBe("EUR");
    expect(resolveCurrency({ cookie: null, country: null, locale: "ro", enabled: ["UAH", "EUR"] })).toBe("UAH");
  });
});
