import { priceIn } from "@/lib/money/format";
import type { MoneyTables } from "@/lib/money/store";
import type { Parcel } from "./types";

// D37: quotes are estimates on a small box of 10 × 10 × 5 cm, with 100 g added to the products' weight
export const ESTIMATE_BOX_MM = { length: 100, width: 100, height: 50 } as const;
export const ESTIMATE_BOX_GRAMS = 100;

// What the parcel is made of: the goods' weight and the order total in UAH, the declared value (D35, D37)
export type OrderGoods = { weightGrams: number; totalUahMinor: number };

// A cart line as the catalogue gives it: the admin's USD price (D4) and the product's weight
export type GoodsLine = { priceUsdMinor: number; weightGrams: number; quantity: number };

/**
 * The goods of a cart: the products' weight and the order total in UAH (each line's displayed UAH price,
 * D4/D6). Null when a UAH price is unavailable or a line holds an impossible number.
 */
export function goodsOf(lines: readonly GoodsLine[], tables: MoneyTables): OrderGoods | null {
  let weightGrams = 0;
  let totalUahMinor = 0;
  for (const { priceUsdMinor, weightGrams: grams, quantity } of lines) {
    if (!(grams >= 0) || !Number.isSafeInteger(quantity) || quantity < 1) return null;
    const unit = priceIn(priceUsdMinor, "UAH", tables);
    if (!unit) return null;
    weightGrams += grams * quantity;
    totalUahMinor += unit.amountMinor * quantity;
  }
  const goods = { weightGrams: Math.ceil(weightGrams), totalUahMinor };
  return Number.isSafeInteger(goods.weightGrams) && Number.isSafeInteger(goods.totalUahMinor) ? goods : null;
}

/**
 * The parcel a live quote is asked for (D37): the estimate box, the goods' weight plus 100 g, and the order
 * total in UAH as both the declared value and the insured value (D35). Null without goods of any value:
 * the API refuses an export from Ukraine insured for nothing, so the zone flat rate stands in.
 */
export function parcelForOrder(goods: OrderGoods | null): Parcel | null {
  if (!goods) return null;
  const { weightGrams, totalUahMinor } = goods;
  if (!Number.isSafeInteger(weightGrams) || weightGrams < 0) return null;
  if (!Number.isSafeInteger(totalUahMinor) || totalUahMinor <= 0) return null;
  return {
    weightGrams: weightGrams + ESTIMATE_BOX_GRAMS,
    lengthMm: ESTIMATE_BOX_MM.length,
    widthMm: ESTIMATE_BOX_MM.width,
    heightMm: ESTIMATE_BOX_MM.height,
    declaredValueMinor: totalUahMinor,
    declaredCurrency: "UAH",
    insuranceUahMinor: totalUahMinor,
  };
}
