import { divideDecimals, divideHalfUp, formatDecimal, parseDecimal, pow10, type Decimal } from "./decimal";

// Minor-unit exponent of USD, the currency every price is entered in
export const USD_DECIMALS = 2;

// Places kept for a cross rate USD→X computed from two NBU rates
export const CROSS_RATE_SCALE = 10;

// One row of currency_settings; every amount is in minor units of the currency
export type CurrencySettings = {
  decimals: number;
  markupBps: number;
  roundIncrement: number;
  ending: number;
  // below this price the small_* pair applies (EUR 29.90), from it up the main pair (EUR 129)
  smallPriceBelow: number | null;
  smallRoundIncrement: number | null;
  smallEnding: number | null;
};

function requireDecimal(rate: string): Decimal {
  const parsed = parseDecimal(rate);
  if (!parsed || parsed.units === BigInt(0)) throw new RangeError(`invalid rate: ${rate}`);
  return parsed;
}

function requireMinor(value: number, what: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${what} must be a non-negative safe integer: ${value}`);
  return value;
}

/*
 * The converted price before charm rounding, exact to the minor unit:
 * usd × rate × (1 + markup), rounded half up to the target currency's minor unit.
 */
export function rawMinor(usdMinor: number, rate: string, settings: Pick<CurrencySettings, "decimals" | "markupBps">): number {
  requireMinor(usdMinor, "usdMinor");
  const { units, scale } = requireDecimal(rate);
  const shift = settings.decimals - USD_DECIMALS;
  const numerator = BigInt(usdMinor) * units * BigInt(10_000 + settings.markupBps) * pow10(Math.max(shift, 0));
  const denominator = pow10(scale) * BigInt(10_000) * pow10(Math.max(-shift, 0));
  return requireMinor(Number(divideHalfUp(numerator, denominator)), "converted price");
}

// The smallest k × increment + ending that is not below the price
function ceilToCharm(price: number, increment: number, ending: number): number {
  if (price <= ending) return ending;
  const step = BigInt(increment);
  const steps = (BigInt(price - ending) + step - BigInt(1)) / step;
  return Number(steps * step + BigInt(ending));
}

// Rounds a price up to the next charm price (D4): 1 281 → 1 289 ₴, 29.20 → 29.90 €, 99.95 → 109 €. Zero stays zero.
export function charmRound(price: number, settings: CurrencySettings): number {
  requireMinor(price, "price");
  if (price === 0) return 0;
  const { smallPriceBelow, smallRoundIncrement, smallEnding } = settings;
  if (smallPriceBelow !== null && smallRoundIncrement !== null && smallEnding !== null) {
    const small = ceilToCharm(price, smallRoundIncrement, smallEnding);
    if (small < smallPriceBelow) return small;
  }
  return requireMinor(ceilToCharm(price, settings.roundIncrement, settings.ending), "rounded price");
}

// A USD price in minor units → the displayed price in the target's minor units
export function convertUsd(usdMinor: number, rate: string, settings: CurrencySettings): number {
  return charmRound(rawMinor(usdMinor, rate, settings), settings);
}

// Cross rate USD→X from the NBU rates of USD and X in UAH
export function crossRate(usdInUah: string, quoteInUah: string): string {
  return formatDecimal(divideDecimals(requireDecimal(usdInUah), requireDecimal(quoteInUah), CROSS_RATE_SCALE));
}

// True when `next` differs from `previous` by strictly more than `bps` basis points of `previous`
export function hasMovedBeyond(previous: string, next: string, bps: number): boolean {
  const a = requireDecimal(previous);
  const b = requireDecimal(next);
  const scale = Math.max(a.scale, b.scale);
  const prev = a.units * pow10(scale - a.scale);
  const curr = b.units * pow10(scale - b.scale);
  const change = curr > prev ? curr - prev : prev - curr;
  return change * BigInt(10_000) > BigInt(bps) * prev;
}

/*
 * Hysteresis (D4). Prices are shown at a display rate per currency, which follows the NBU cross rate only
 * when that moved more than `hysteresisBps` from it. Every raw price is proportional to the rate, so a
 * displayed price is re-rounded only when its raw price moved more than the hysteresis, and never flickers
 * from day to day.
 */
export function nextDisplayRate(current: string | null, latest: string, hysteresisBps: number): string {
  if (current === null || hasMovedBeyond(current, latest, hysteresisBps)) return latest;
  return current;
}
