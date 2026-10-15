import { describe, expect, it } from "vitest";
import { deliveryPriceIn } from "@/lib/delivery/nova-post/convert";
import { priceIn } from "@/lib/money/format";
import type { CurrencyConfig, MoneyTables } from "@/lib/money/store";

// The seeded settings of the money migration (D4: 3 % markup; charm rounding per currency)
const whole: CurrencyConfig = {
  decimals: 2,
  markupBps: 300,
  roundIncrement: 1000,
  ending: 900,
  smallPriceBelow: null,
  smallRoundIncrement: null,
  smallEnding: null,
  enabled: true,
};
const cents: CurrencyConfig = { ...whole, smallPriceBelow: 10000, smallRoundIncrement: 100, smallEnding: 90 };

const tables: MoneyTables = {
  settings: { UAH: whole, PLN: whole, CZK: whole, RON: whole, EUR: cents, USD: cents, CHF: cents },
  displayRates: {
    UAH: { rate: "41.5", rateDate: "2026-10-15" },
    EUR: { rate: "0.86", rateDate: "2026-10-15" },
    PLN: { rate: "3.65", rateDate: "2026-10-15" },
    CHF: { rate: "0.8", rateDate: "2026-10-15" },
  },
};

describe("a delivery quote in the display currency (D4, D28)", () => {
  it("converts UAH to EUR through the cross rate, with the markup and charm rounding up", () => {
    // 450 UAH × (0.86 / 41.5) = 9.3253 EUR; × 1.03 = 9.6051 → 9.61 → charm 9.90
    expect(deliveryPriceIn({ currency: "UAH", amountMinor: 45000 }, "EUR", tables)).toEqual({
      currency: "EUR",
      amountMinor: 990,
      decimals: 2,
    });
  });

  it("converts UAH to PLN and CHF", () => {
    // 397.50 UAH × 3.65 / 41.5 = 34.96 PLN; × 1.03 = 36.01 → whole ending 9: 39
    expect(deliveryPriceIn({ currency: "UAH", amountMinor: 39750 }, "PLN", tables)?.amountMinor).toBe(3900);
    // 612.75 UAH × 0.8 / 41.5 = 11.81 CHF; × 1.03 = 12.17 → 12.90
    expect(deliveryPriceIn({ currency: "UAH", amountMinor: 61275 }, "CHF", tables)?.amountMinor).toBe(1290);
  });

  it("keeps the markup when the quote is already in the display currency (D28)", () => {
    // 11.75 EUR × 1.03 = 12.10 → 12.90
    expect(deliveryPriceIn({ currency: "EUR", amountMinor: 1175 }, "EUR", tables)?.amountMinor).toBe(1290);
  });

  it("shows a USD amount exactly like a USD product price", () => {
    for (const target of ["EUR", "PLN", "UAH", "CHF", "USD"] as const) {
      expect(deliveryPriceIn({ currency: "USD", amountMinor: 1499 }, target, tables)).toEqual(priceIn(1499, target, tables));
    }
  });

  it("is unavailable for a currency the shop does not show, or without a rate or settings", () => {
    expect(deliveryPriceIn({ currency: "HUF", amountMinor: 100000 }, "EUR", tables)).toBeNull();
    expect(deliveryPriceIn({ currency: "UAH", amountMinor: 45000 }, "CZK", tables)).toBeNull();
    expect(deliveryPriceIn({ currency: "CZK", amountMinor: 45000 }, "EUR", tables)).toBeNull();
    expect(deliveryPriceIn({ currency: "UAH", amountMinor: 45000 }, "EUR", { ...tables, settings: {} })).toBeNull();
  });

  it("refuses a negative or unsafe amount", () => {
    expect(deliveryPriceIn({ currency: "EUR", amountMinor: -1 }, "EUR", tables)).toBeNull();
    expect(deliveryPriceIn({ currency: "EUR", amountMinor: 1.5 }, "EUR", tables)).toBeNull();
  });
});
