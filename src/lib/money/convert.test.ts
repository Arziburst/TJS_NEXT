import { describe, expect, it } from "vitest";
import type { Currency } from "./currencies";
import {
  charmRound,
  convertUsd,
  crossRate,
  hasMovedBeyond,
  nextDisplayRate,
  rawMinor,
  type CurrencySettings,
} from "./convert";

// The rows seeded by supabase/migrations/20261016001400_money_display.sql (D4)
const wholeEndingNine: CurrencySettings = {
  decimals: 2,
  markupBps: 300,
  roundIncrement: 1000,
  ending: 900,
  smallPriceBelow: null,
  smallRoundIncrement: null,
  smallEnding: null,
};
const ninetyUnderHundred: CurrencySettings = {
  ...wholeEndingNine,
  smallPriceBelow: 10000,
  smallRoundIncrement: 100,
  smallEnding: 90,
};
const SETTINGS: Record<Currency, CurrencySettings> = {
  UAH: wholeEndingNine,
  EUR: ninetyUnderHundred,
  USD: ninetyUnderHundred,
  PLN: wholeEndingNine,
  CZK: wholeEndingNine,
  RON: wholeEndingNine,
  CHF: ninetyUnderHundred,
};

// USD→X cross rates from the NBU rates of 2026-10-15 (supabase/seed.sql)
const RATES: Record<Currency, string> = {
  UAH: "44.9801",
  EUR: "0.8934319589",
  USD: "1",
  PLN: "3.9012376731",
  CZK: "21.7621075040",
  RON: "4.7745013746",
  CHF: "0.8331206392",
};

describe("rawMinor", () => {
  it.each([
    { name: "zero", usd: 0, rate: "44.9801", markup: 300, expected: 0 },
    { name: "identity without markup", usd: 2990, rate: "1", markup: 0, expected: 2990 },
    { name: "3 % markup", usd: 1000, rate: "1", markup: 300, expected: 1030 },
    { name: "UAH $27.80", usd: 2780, rate: "44.9801", markup: 300, expected: 128796 },
    { name: "EUR $32", usd: 3200, rate: "0.8934319589", markup: 300, expected: 2945 },
    { name: "half a cent rounds up", usd: 1, rate: "0.5", markup: 0, expected: 1 },
    { name: "just under half a cent rounds down", usd: 1, rate: "0.4999999999", markup: 0, expected: 0 },
    { name: "a tiny price keeps its cents", usd: 1, rate: "44.9801", markup: 300, expected: 46 },
    { name: "the largest safe price", usd: Number.MAX_SAFE_INTEGER, rate: "1", markup: 0, expected: Number.MAX_SAFE_INTEGER },
  ])("$name", ({ usd, rate, markup, expected }) => {
    expect(rawMinor(usd, rate, { decimals: 2, markupBps: markup })).toBe(expected);
  });

  it("scales between minor units of different exponents", () => {
    expect(rawMinor(1234, "1", { decimals: 0, markupBps: 0 })).toBe(12);
    expect(rawMinor(1250, "1", { decimals: 0, markupBps: 0 })).toBe(13);
    expect(rawMinor(1234, "1", { decimals: 3, markupBps: 0 })).toBe(12340);
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("rejects the price %s", (usd) => {
    expect(() => rawMinor(usd, "1", { decimals: 2, markupBps: 0 })).toThrow(RangeError);
  });

  it.each(["0", "", "abc", "1e-3", "-1", "1,5"])("rejects the rate %j", (rate) => {
    expect(() => rawMinor(100, rate, { decimals: 2, markupBps: 0 })).toThrow(RangeError);
  });

  it("rejects a result beyond the safe integers", () => {
    expect(() => rawMinor(Number.MAX_SAFE_INTEGER, "2", { decimals: 2, markupBps: 0 })).toThrow(RangeError);
  });
});

describe("charmRound (D4)", () => {
  it.each<{ currency: Currency; price: number; expected: number }>([
    // UAH: whole hryvnias ending 9, by tens
    { currency: "UAH", price: 0, expected: 0 },
    { currency: "UAH", price: 1, expected: 900 },
    { currency: "UAH", price: 900, expected: 900 },
    { currency: "UAH", price: 901, expected: 1900 },
    { currency: "UAH", price: 128100, expected: 128900 },
    { currency: "UAH", price: 128796, expected: 128900 },
    { currency: "UAH", price: 128900, expected: 128900 },
    { currency: "UAH", price: 128901, expected: 129900 },
    { currency: "UAH", price: 999_999_999_999_01, expected: 1_000_000_000_009_00 },
    // EUR: .90 under 100, whole ending 9 from 100
    { currency: "EUR", price: 0, expected: 0 },
    { currency: "EUR", price: 1, expected: 90 },
    { currency: "EUR", price: 90, expected: 90 },
    { currency: "EUR", price: 2945, expected: 2990 },
    { currency: "EUR", price: 2990, expected: 2990 },
    { currency: "EUR", price: 2991, expected: 3090 },
    { currency: "EUR", price: 9990, expected: 9990 },
    { currency: "EUR", price: 9991, expected: 10900 },
    { currency: "EUR", price: 10000, expected: 10900 },
    { currency: "EUR", price: 10900, expected: 10900 },
    { currency: "EUR", price: 12801, expected: 12900 },
    // USD and CHF follow the EUR rule
    { currency: "USD", price: 2930, expected: 2990 },
    { currency: "USD", price: 9995, expected: 10900 },
    { currency: "CHF", price: 4512, expected: 4590 },
    { currency: "CHF", price: 15001, expected: 15900 },
    // PLN, RON: whole, ending 9
    { currency: "PLN", price: 1, expected: 900 },
    { currency: "PLN", price: 12858, expected: 12900 },
    { currency: "PLN", price: 12900, expected: 12900 },
    { currency: "RON", price: 4512, expected: 4900 },
    { currency: "RON", price: 12901, expected: 13900 },
    // CZK: by tens, ending 9
    { currency: "CZK", price: 73969, expected: 74900 },
    { currency: "CZK", price: 74900, expected: 74900 },
  ])("$currency $price → $expected", ({ currency, price, expected }) => {
    expect(charmRound(price, SETTINGS[currency])).toBe(expected);
  });

  it("never rounds below the raw price", () => {
    for (const currency of Object.keys(SETTINGS) as Currency[]) {
      for (let price = 1; price < 30_000; price += 7) {
        const rounded = charmRound(price, SETTINGS[currency]);
        expect(rounded).toBeGreaterThanOrEqual(price);
        expect(rounded - price).toBeLessThan(1000);
      }
    }
  });

  it("rejects a result beyond the safe integers", () => {
    expect(() => charmRound(Number.MAX_SAFE_INTEGER - 5, SETTINGS.UAH)).toThrow(RangeError);
  });

  it("rejects a negative or fractional price", () => {
    expect(() => charmRound(-1, SETTINGS.UAH)).toThrow(RangeError);
    expect(() => charmRound(10.5, SETTINGS.UAH)).toThrow(RangeError);
  });
});

describe("convertUsd at the NBU rates of 2026-10-15", () => {
  it.each<{ currency: Currency; usd: number; expected: number }>([
    { currency: "UAH", usd: 2780, expected: 128900 }, // 1 289 ₴
    { currency: "EUR", usd: 3200, expected: 2990 }, // €29.90
    { currency: "USD", usd: 2900, expected: 2990 }, // $29.87 → $29.90
    { currency: "PLN", usd: 3200, expected: 12900 }, // 129 zł
    { currency: "CZK", usd: 3300, expected: 74900 }, // 749 Kč
    { currency: "RON", usd: 2600, expected: 12900 }, // 129 lei
    { currency: "CHF", usd: 3500, expected: 3090 }, // CHF 30.90
    { currency: "EUR", usd: 0, expected: 0 },
    { currency: "UAH", usd: 1, expected: 900 },
    { currency: "EUR", usd: 100_000_00, expected: 92_029_00 },
  ])("$currency $usd → $expected", ({ currency, usd, expected }) => {
    expect(convertUsd(usd, RATES[currency], SETTINGS[currency])).toBe(expected);
  });
});

describe("crossRate", () => {
  it("divides the NBU rates and rounds half up to 10 places", () => {
    expect(crossRate("44.9801", "50.3453")).toBe("0.8934319589");
    expect(crossRate("44.9801", "2.0669")).toBe("21.7621075040");
    expect(crossRate("2", "3")).toBe("0.6666666667");
    expect(crossRate("1", "3")).toBe("0.3333333333");
  });

  it("rejects a zero or malformed rate", () => {
    expect(() => crossRate("44.98", "0")).toThrow(RangeError);
    expect(() => crossRate("44.98", "n/a")).toThrow(RangeError);
  });
});

describe("hysteresis (1.5 %)", () => {
  it.each([
    { previous: "40", next: "40", moved: false },
    { previous: "40", next: "40.6", moved: false }, // exactly +1.5 %
    { previous: "40", next: "40.6000000001", moved: true },
    { previous: "40", next: "39.4", moved: false }, // exactly −1.5 %
    { previous: "40", next: "39.3999999999", moved: true },
    { previous: "0.8", next: "0.812", moved: false },
    { previous: "0.8", next: "0.8120000001", moved: true },
  ])("$previous → $next moved: $moved", ({ previous, next, moved }) => {
    expect(hasMovedBeyond(previous, next, 150)).toBe(moved);
  });

  it("with 0 bps any change counts", () => {
    expect(hasMovedBeyond("40", "40.0001", 0)).toBe(true);
    expect(hasMovedBeyond("40", "40.0000", 0)).toBe(false);
  });

  it("keeps the display rate until the NBU rate moved more than the hysteresis", () => {
    expect(nextDisplayRate(null, "44.9801", 150)).toBe("44.9801");
    expect(nextDisplayRate("44.9801", "45.6548", 150)).toBe("44.9801");
    expect(nextDisplayRate("44.9801", "45.6549", 150)).toBe("45.6549");
    expect(nextDisplayRate("44.9801", "44.3054", 150)).toBe("44.9801");
    expect(nextDisplayRate("44.9801", "44.3053", 150)).toBe("44.3053");
  });

  it("a displayed price changes only when its raw price moved more than 1.5 %", () => {
    const usd = 2780;
    const days = ["44.9801", "45.2000", "45.5100", "44.6000", "45.6548", "45.6600", "45.7000", "45.0000"];
    let displayRate: string | null = null;
    const shown: number[] = [];
    const reanchoredOn: number[] = [];
    days.forEach((rate, day) => {
      const next = nextDisplayRate(displayRate, rate, 150);
      if (next !== displayRate) reanchoredOn.push(day);
      displayRate = next;
      shown.push(convertUsd(usd, displayRate, SETTINGS.UAH));
    });
    // day 5: 45.66 is 1.51 % above 44.9801; day 7: 45.00 is 1.45 % below 45.66
    expect(reanchoredOn).toEqual([0, 5]);
    expect(shown).toEqual([128900, 128900, 128900, 128900, 128900, 130900, 130900, 130900]);
    // the raw price behind each change moved more than 1.5 % from the raw price behind the previous one
    const rawAtFirst = 2780 * 44.9801 * 1.03;
    const rawAtSecond = 2780 * 45.66 * 1.03;
    expect(rawAtSecond / rawAtFirst - 1).toBeGreaterThan(0.015);
  });
});
