import { convertUsd, crossRate } from "@/lib/money/convert";
import { BASE_CURRENCY, isCurrency, type Currency } from "@/lib/money/currencies";
import type { Money } from "@/lib/money/format";
import type { MoneyTables } from "@/lib/money/store";
import type { CarrierMoney } from "./types";

// The USD→X display rate, "1" for USD itself; undefined when the rates job has none yet
function usdRate(currency: Currency, tables: Pick<MoneyTables, "displayRates">): string | undefined {
  return currency === BASE_CURRENCY ? "1" : tables.displayRates[currency]?.rate;
}

/**
 * A delivery price in the visitor's display currency by the rules of product prices (D4, D28): the
 * display rate (via USD: the cross rate of two display rates), the currency's markup, charm rounding
 * always up. A carrier amount has two minor digits like a USD price (every currency here has two). Null
 * when the carrier's currency is not one of the shop's, or a rate or the settings are missing: the caller
 * shows the price as unavailable, never a guess.
 */
export function deliveryPriceIn(price: CarrierMoney, target: Currency, tables: MoneyTables): Money | null {
  if (!isCurrency(price.currency) || !Number.isSafeInteger(price.amountMinor) || price.amountMinor < 0) return null;
  const settings = tables.settings[target];
  if (!settings) return null;
  const targetRate = usdRate(target, tables);
  const sourceRate = usdRate(price.currency, tables);
  if (!targetRate || !sourceRate) return null;
  // source → target = (USD → target) / (USD → source)
  const rate = price.currency === BASE_CURRENCY ? targetRate : crossRate(targetRate, sourceRate);
  return { currency: target, amountMinor: convertUsd(price.amountMinor, rate, settings), decimals: settings.decimals };
}
