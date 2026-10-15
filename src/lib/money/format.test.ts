import { describe, expect, it } from "vitest";
import type { CurrencySettings } from "./convert";
import { decimalString, formatMoney, priceIn, type Money } from "./format";

// Intl separates groups and the symbol with (narrow) no-break spaces; compare with plain ones
const plain = (text: string) => text.replace(/[  ]/g, " ");

const money = (currency: Money["currency"], amountMinor: number): Money => ({ currency, amountMinor, decimals: 2 });

describe("formatMoney", () => {
  it.each([
    ["uk", money("UAH", 128900), "1 289 ₴"],
    ["en", money("UAH", 128900), "₴1,289"],
    ["en", money("EUR", 2990), "€29.90"],
    ["de", money("EUR", 2990), "29,90 €"],
    ["fr", money("EUR", 12900), "129 €"],
    ["pl", money("PLN", 12900), "129 zł"],
    ["cs", money("CZK", 74900), "749 Kč"],
    ["en", money("USD", 2990), "$29.90"],
    ["de", money("CHF", 3090), "30,90 CHF"],
    ["en", money("EUR", 0), "€0"],
    ["ro", money("RON", 12900), "129 lei"],
    ["en", money("RON", 12900), "lei 129"],
    ["de", money("RON", 12900), "129 RON"],
    ["fr", money("RON", 12900), "129 RON"],
  ])("%s %j → %s", (locale, value, expected) => {
    expect(plain(formatMoney(value, locale))).toBe(expected);
  });

  it("shows every decimal of a price with cents", () => {
    expect(formatMoney(money("EUR", 2905), "en")).toBe("€29.05");
  });
});

describe("decimalString", () => {
  it.each([
    [money("EUR", 2990), "29.90"],
    [money("EUR", 12900), "129.00"],
    [money("EUR", 5), "0.05"],
    [money("UAH", 0), "0.00"],
    [{ currency: "UAH", amountMinor: 1289, decimals: 0 } as Money, "1289"],
  ])("%j → %s", (value, expected) => {
    expect(decimalString(value)).toBe(expected);
  });
});

describe("priceIn", () => {
  const eur: CurrencySettings = {
    decimals: 2,
    markupBps: 300,
    roundIncrement: 1000,
    ending: 900,
    smallPriceBelow: 10000,
    smallRoundIncrement: 100,
    smallEnding: 90,
  };

  it("converts at the display rate", () => {
    const tables = { settings: { EUR: eur }, displayRates: { EUR: { rate: "0.8934319589" } } };
    expect(priceIn(3200, "EUR", tables)).toEqual({ currency: "EUR", amountMinor: 2990, decimals: 2 });
  });

  it("needs no rate for USD", () => {
    expect(priceIn(2900, "USD", { settings: { USD: eur }, displayRates: {} })).toEqual({
      currency: "USD",
      amountMinor: 2990,
      decimals: 2,
    });
  });

  it("is null without a display rate or settings", () => {
    expect(priceIn(3200, "EUR", { settings: { EUR: eur }, displayRates: {} })).toBeNull();
    expect(priceIn(3200, "EUR", { settings: {}, displayRates: { EUR: { rate: "0.89" } } })).toBeNull();
  });
});
