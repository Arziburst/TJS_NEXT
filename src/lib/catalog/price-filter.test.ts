import { describe, expect, it } from "vitest";
import { currencies } from "@/lib/money/currencies";
import { priceIn } from "@/lib/money/format";
import type { MoneyTables } from "@/lib/money/store";
import { amountToMinor, MAX_USD_MINOR, usdBoundsFor } from "./price-filter";

// The rows of the money migration and the seeded NBU rates of 2026-10-15 (as src/lib/money/prices.test.ts)
const whole = { decimals: 2, markupBps: 300, roundIncrement: 1000, ending: 900, enabled: true };
const wholeOnly = { ...whole, smallPriceBelow: null, smallRoundIncrement: null, smallEnding: null };
const twoTiers = { ...whole, smallPriceBelow: 10000, smallRoundIncrement: 100, smallEnding: 90 };
const rate = (value: string) => ({ rate: value, rateDate: "2026-10-15" });
const TABLES: MoneyTables = {
  settings: { UAH: wholeOnly, EUR: twoTiers, USD: twoTiers, PLN: wholeOnly, CZK: wholeOnly, RON: wholeOnly, CHF: twoTiers },
  displayRates: {
    UAH: rate("44.9801"),
    EUR: rate("0.8934319589"),
    PLN: rate("3.9012376731"),
    CZK: rate("21.7621075040"),
    RON: rate("4.7745013746"),
    CHF: rate("0.8331206392"),
  },
};

const displayed = (usdMinor: number, currency: (typeof currencies)[number]) => priceIn(usdMinor, currency, TABLES)!.amountMinor;

// every cent up to $300 and a few large prices
const SAMPLE = [...Array.from({ length: 30_001 }, (_, i) => i), 99_999, 1_234_567, 99_999_999, MAX_USD_MINOR];

describe("amountToMinor", () => {
  it("reads a typed amount in the currency's minor units", () => {
    expect(amountToMinor("1289", 2)).toBe(128_900);
    expect(amountToMinor("29.9", 2)).toBe(2990);
    expect(amountToMinor("29.90", 2)).toBe(2990);
    expect(amountToMinor("0", 2)).toBe(0);
  });

  it("refuses more places than the currency has, and anything that is not an amount", () => {
    expect(amountToMinor("29.905", 2)).toBeNull();
    expect(amountToMinor("1.5", 0)).toBeNull();
    for (const text of ["", "-1", "1e3", "12,50", " 1", "abc", "9".repeat(20)]) expect(amountToMinor(text, 2), text).toBeNull();
  });
});

describe("usdBoundsFor", () => {
  it("relies on a displayed price that never falls when the USD price rises", () => {
    for (const currency of currencies) {
      for (let i = 1; i < SAMPLE.length; i++) {
        expect(displayed(SAMPLE[i], currency), `${currency} at ${SAMPLE[i]}`).toBeGreaterThanOrEqual(displayed(SAMPLE[i - 1], currency));
      }
    }
  });

  it.each([
    ["UAH", 50_000, 150_000],
    ["UAH", 128_900, 128_900],
    ["EUR", 2990, 4990],
    ["EUR", null, 2000],
    ["USD", 10_000, null],
    ["PLN", 12_900, 25_900],
    ["CZK", 74_900, 99_900],
    ["CHF", 1, 10_900],
    ["RON", 0, 0],
  ] as const)("%s %s..%s: a product is in range exactly when its displayed price is", (currency, min, max) => {
    const bounds = usdBoundsFor(min, max, currency, TABLES)!;
    for (const usd of SAMPLE) {
      const price = displayed(usd, currency);
      const shown = (min === null || price >= min) && (max === null || price <= max);
      const filtered =
        (bounds.minUsdMinor === null || usd >= bounds.minUsdMinor) && (bounds.maxUsdMinor === null || usd <= bounds.maxUsdMinor);
      if (filtered !== shown) expect.fail(`${currency} ${usd}¢ shows ${price}, filtered ${filtered}, shown ${shown}`);
    }
  });

  it("leaves open bounds open and closes the range no price reaches", () => {
    expect(usdBoundsFor(null, null, "UAH", TABLES)).toEqual({ minUsdMinor: null, maxUsdMinor: null });
    expect(usdBoundsFor(0, null, "EUR", TABLES)).toEqual({ minUsdMinor: null, maxUsdMinor: null });
    expect(usdBoundsFor(Number.MAX_SAFE_INTEGER, null, "USD", TABLES)!.minUsdMinor).toBeGreaterThan(MAX_USD_MINOR);
    expect(usdBoundsFor(null, Number.MAX_SAFE_INTEGER, "USD", TABLES)).toEqual({ minUsdMinor: null, maxUsdMinor: null });
  });

  it("is off for a currency without settings or rate", () => {
    const noRate: MoneyTables = { ...TABLES, displayRates: { ...TABLES.displayRates, PLN: undefined } };
    expect(usdBoundsFor(100, 200, "PLN", noRate)).toBeNull();
  });
});
