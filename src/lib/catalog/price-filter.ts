import type { Currency } from "@/lib/money/currencies";
import { priceIn } from "@/lib/money/format";
import type { MoneyTables } from "@/lib/money/store";

/*
 * The price filter of the listing: the visitor types a range in their display currency, the database
 * filters price_usd. The bounds are converted on the server with the displayed price itself (D4, D28: the
 * rate, the markup and the charm rounding of priceIn), so a product is in the range exactly when the price
 * the visitor sees on its card is.
 */

/** numeric(10,2): the highest price_usd in cents. */
export const MAX_USD_MINOR = 9_999_999_999;

/** "29.90" in a currency with `decimals` places -> 2990; null when it has more places or is too large. */
export function amountToMinor(text: string, decimals: number): number | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) return null;
  const minor = Number(match[1]) * 10 ** decimals + Number(fraction.padEnd(decimals, "0") || "0");
  return Number.isSafeInteger(minor) ? minor : null;
}

// The smallest USD price (cents) whose displayed price passes `ok`, given that the displayed price never
// falls when the USD price rises; null when none up to MAX_USD_MINOR does.
function firstUsd(ok: (usdMinor: number) => boolean): number | null {
  if (!ok(MAX_USD_MINOR)) return null;
  let low = 0;
  let high = MAX_USD_MINOR;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (ok(mid)) high = mid;
    else low = mid + 1;
  }
  return low;
}

export type UsdBounds = { minUsdMinor: number | null; maxUsdMinor: number | null };

/**
 * USD bounds (cents, inclusive) for a range of displayed prices in `currency` (minor units, either open).
 * A bound no price can reach gives an empty range (min above MAX_USD_MINOR, or max below 0 never happens:
 * the displayed price of 0 is 0). Null when `currency` has no settings or rate (the filter is then off).
 */
export function usdBoundsFor(
  minMinor: number | null,
  maxMinor: number | null,
  currency: Currency,
  tables: MoneyTables,
): UsdBounds | null {
  if (!priceIn(0, currency, tables)) return null;
  const displayed = (usdMinor: number) => priceIn(usdMinor, currency, tables)!.amountMinor;

  const minUsdMinor = minMinor === null || minMinor <= 0 ? null : (firstUsd((u) => displayed(u) >= minMinor) ?? MAX_USD_MINOR + 1);
  let maxUsdMinor: number | null = null;
  if (maxMinor !== null) {
    const above = firstUsd((u) => displayed(u) > maxMinor);
    maxUsdMinor = above === null ? null : above - 1;
  }
  return { minUsdMinor, maxUsdMinor };
}
