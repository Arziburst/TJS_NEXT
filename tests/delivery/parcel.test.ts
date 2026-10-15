import { describe, expect, it } from "vitest";
import { goodsOf, parcelForOrder } from "@/lib/delivery/nova-post/parcel";
import type { CurrencyConfig, MoneyTables } from "@/lib/money/store";

// The money migration's UAH settings and the seeded display rate of 2026-10-15
const uah: CurrencyConfig = {
  decimals: 2,
  markupBps: 300,
  roundIncrement: 1000,
  ending: 900,
  smallPriceBelow: null,
  smallRoundIncrement: null,
  smallEnding: null,
  enabled: true,
};
const tables: MoneyTables = { settings: { UAH: uah }, displayRates: { UAH: { rate: "44.9801", rateDate: "2026-10-15" } } };

describe("the parcel of a live quote (D37, D35)", () => {
  it("is the estimate box with 100 g added, declared and insured at the order total in UAH", () => {
    expect(parcelForOrder({ weightGrams: 36, totalUahMinor: 257_800 })).toEqual({
      weightGrams: 136,
      lengthMm: 100,
      widthMm: 100,
      heightMm: 50,
      declaredValueMinor: 257_800,
      declaredCurrency: "UAH",
      insuranceUahMinor: 257_800,
    });
  });

  it("does not exist without goods of any value (the zone flat rate stands in)", () => {
    expect(parcelForOrder(null)).toBeNull();
    expect(parcelForOrder({ weightGrams: 10, totalUahMinor: 0 })).toBeNull();
    expect(parcelForOrder({ weightGrams: -1, totalUahMinor: 100 })).toBeNull();
    expect(parcelForOrder({ weightGrams: 1.5, totalUahMinor: 100 })).toBeNull();
  });
});

describe("the goods of a cart", () => {
  it("sum the weights (rounded up to a gram) and the lines' UAH prices", () => {
    // $27.80 shows as 1 289 ₴ at the seeded rate (D4); two of them and one at $32.00 (1 489 ₴)
    expect(
      goodsOf(
        [
          { priceUsdMinor: 2780, weightGrams: 6.4, quantity: 2 },
          { priceUsdMinor: 3200, weightGrams: 12, quantity: 1 },
        ],
        tables,
      ),
    ).toEqual({ weightGrams: 25, totalUahMinor: 2 * 128_900 + 148_900 });
  });

  it("are unknown without a UAH price or with an impossible line", () => {
    expect(goodsOf([{ priceUsdMinor: 2780, weightGrams: 6, quantity: 1 }], { settings: {}, displayRates: {} })).toBeNull();
    expect(goodsOf([{ priceUsdMinor: 2780, weightGrams: 6, quantity: 0 }], tables)).toBeNull();
    expect(goodsOf([{ priceUsdMinor: 2780, weightGrams: Number.NaN, quantity: 1 }], tables)).toBeNull();
  });
});
