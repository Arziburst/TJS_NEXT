import { describe, expect, it } from "vitest";
import type { CurrencyConfig, MoneyTables } from "@/lib/money/store";
import { buildQuote, type QuoteItem } from "./quote";

const cents: CurrencyConfig = {
  decimals: 2,
  markupBps: 300,
  roundIncrement: 1000,
  ending: 900,
  smallPriceBelow: 10000,
  smallRoundIncrement: 100,
  smallEnding: 90,
  enabled: true,
};
const hryvnias: CurrencyConfig = { ...cents, roundIncrement: 1000, ending: 900, smallPriceBelow: null, smallRoundIncrement: null, smallEnding: null };
// test rates and settings, not the shop's
const tables: MoneyTables = {
  settings: { EUR: cents, USD: cents, UAH: hryvnias },
  displayRates: { EUR: { rate: "0.86", rateDate: "2026-10-15" }, UAH: { rate: "41.5", rateDate: "2026-10-15" } },
};

function item(overrides: Partial<QuoteItem> = {}): QuoteItem {
  return {
    productId: "a0000000-0000-4000-8000-000000000001",
    variantId: null,
    fulfillment: "made_to_order",
    title: "Earrings",
    titleLocale: "en",
    variantLabel: null,
    sku: "TEST-001",
    priceUsdMinor: 2490,
    regularPriceUsdMinor: overrides.priceUsdMinor ?? 2490,
    weightGrams: 6,
    quantity: 1,
    ...overrides,
  };
}

describe("buildQuote", () => {
  it("prices each line as displayed: rate, 3 % markup, charm rounding up (D4, D28)", () => {
    // 24.90 × 0.86 × 1.03 = 22.06 → €22.90
    const result = buildQuote([item({ quantity: 3 })], "EUR", tables);
    expect(result).toEqual({
      ok: true,
      quote: {
        currency: "EUR",
        decimals: 2,
        fxRate: "0.86",
        fxRateDate: "2026-10-15",
        markupBps: 300,
        lines: [{ ...item({ quantity: 3 }), position: 0, unitMinor: 2290, regularUnitMinor: 2290, lineMinor: 6870, lineUsdMinor: 7470 }],
        totalUsdMinor: 7470,
        totalMinor: 6870,
      },
    });
  });

  it("totals the displayed line totals, so the total equals the cart's subtotal", () => {
    const lines = [
      item({ quantity: 2 }),
      item({ productId: "a0000000-0000-4000-8000-000000000009", fulfillment: "one_of_a_kind", priceUsdMinor: 2990, title: "Coral" }),
    ];
    const result = buildQuote(lines, "UAH", tables);
    if (!result.ok) throw new Error("expected a quote");
    const { quote } = result;
    expect(quote.lines.map((line) => line.position)).toEqual([0, 1]);
    expect(quote.totalMinor).toBe(quote.lines.reduce((sum, line) => sum + line.unitMinor * line.quantity, 0));
    expect(quote.totalUsdMinor).toBe(2490 * 2 + 2990);
    // charm rounding of the main pair: whole hryvnias ending in 9
    for (const line of quote.lines) expect(line.unitMinor % 1000).toBe(900);
  });

  it("prices two sizes of one product as two lines at their own prices (#66)", () => {
    const sizes = [
      item({ variantId: "c6000000-0000-4000-8000-000000000016", variantLabel: { text: "16", locale: "uk" }, quantity: 2 }),
      item({ variantId: "c6000000-0000-4000-8000-000000000018", variantLabel: { text: "18", locale: "uk" }, priceUsdMinor: 2990 }),
    ];
    const result = buildQuote(sizes, "EUR", tables);
    if (!result.ok) throw new Error("expected a quote");
    // 24.90 → €22.90 and 29.90 → €26.90, as the cart shows them
    expect(result.quote.lines.map((line) => [line.variantLabel?.text, line.unitMinor, line.lineMinor, line.lineUsdMinor])).toEqual([
      ["16", 2290, 4580, 4980],
      ["18", 2690, 2690, 2990],
    ]);
    expect([result.quote.totalUsdMinor, result.quote.totalMinor]).toEqual([4980 + 2990, 4580 + 2690]);
  });

  it("prices USD at the rate 1 with no rate date", () => {
    const result = buildQuote([item()], "USD", tables);
    expect(result.ok && { rate: result.quote.fxRate, date: result.quote.fxRateDate }).toEqual({ rate: "1", date: null });
  });

  it("refuses an empty order", () => {
    expect(buildQuote([], "EUR", tables)).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses without a rate or the currency's settings, instead of guessing a price", () => {
    expect(buildQuote([item()], "PLN", tables)).toEqual({ ok: false, reason: "noRate" });
    expect(buildQuote([item()], "EUR", null)).toEqual({ ok: false, reason: "noRate" });
    expect(buildQuote([item()], "EUR", { ...tables, displayRates: {} })).toEqual({ ok: false, reason: "noRate" });
  });

  it("refuses an impossible quantity or price", () => {
    expect(buildQuote([item({ quantity: 0 })], "EUR", tables)).toEqual({ ok: false, reason: "invalid" });
    expect(buildQuote([item({ quantity: 1.5 })], "EUR", tables)).toEqual({ ok: false, reason: "invalid" });
    expect(buildQuote([item({ priceUsdMinor: -1 })], "EUR", tables)).toEqual({ ok: false, reason: "invalid" });
    // a regular price below the price charged is no sale
    expect(buildQuote([item({ priceUsdMinor: 2490, regularPriceUsdMinor: 1990 })], "EUR", tables)).toEqual({ ok: false, reason: "invalid" });
  });

  it("charges the sale price and keeps the regular one, both converted as displayed (#67)", () => {
    // sale 19.92 × 0.86 × 1.03 = 17.65 → €17.90; regular 24.90 → €22.90
    const result = buildQuote([item({ priceUsdMinor: 1992, regularPriceUsdMinor: 2490, quantity: 2 })], "EUR", tables);
    expect(result.ok && result.quote.lines[0]).toMatchObject({ unitMinor: 1790, regularUnitMinor: 2290, lineMinor: 3580, lineUsdMinor: 3984 });
    expect(result.ok && [result.quote.totalUsdMinor, result.quote.totalMinor]).toEqual([3984, 3580]);
  });
});
