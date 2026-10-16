import type { Locale } from "@/i18n/routing";
import type { ProductFulfillment } from "@/lib/catalog/types";
import { BASE_CURRENCY, type Currency } from "@/lib/money/currencies";
import { priceIn } from "@/lib/money/format";
import type { MoneyTables } from "@/lib/money/store";

// The order request's prices, built by the server from the catalog (never from the client): every unit price
// as the visitor saw it (D4: the display rate, the markup, charm rounding up), times its quantity. The goods
// total is the sum of those line totals, so it equals the cart's subtotal. Pure: the tests drive it directly.

/** An orderable cart line with its product as the database has it now. */
export type QuoteItem = {
  productId: string;
  variantId: string | null;
  fulfillment: ProductFulfillment;
  title: string;
  titleLocale: Locale;
  /** The size as the customer saw it (#66), with the locale of its label; null without a variant. */
  variantLabel: { text: string; locale: Locale } | null;
  sku: string | null;
  /** The unit price: the variant's price for a line of a variant, else the product's. */
  priceUsdMinor: number;
  weightGrams: number;
  quantity: number;
};

export type QuoteLine = QuoteItem & {
  position: number;
  // in the quote's currency
  unitMinor: number;
  lineMinor: number;
  lineUsdMinor: number;
};

export type Quote = {
  currency: Currency;
  decimals: number;
  // the USD→currency display rate the lines were converted at ("1" for USD) and its date (null for USD)
  fxRate: string;
  fxRateDate: string | null;
  markupBps: number;
  lines: QuoteLine[];
  totalUsdMinor: number;
  totalMinor: number;
};

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; reason: "empty" | "noRate" | "invalid" };

export function buildQuote(items: readonly QuoteItem[], currency: Currency, tables: MoneyTables | null): QuoteResult {
  if (items.length === 0) return { ok: false, reason: "empty" };
  const settings = tables?.settings[currency];
  const rate = currency === BASE_CURRENCY ? { rate: "1", rateDate: null } : tables?.displayRates[currency];
  if (!tables || !settings || !rate) return { ok: false, reason: "noRate" };

  const lines: QuoteLine[] = [];
  let totalMinor = 0;
  let totalUsdMinor = 0;
  for (const [position, item] of items.entries()) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) return { ok: false, reason: "invalid" };
    if (!Number.isSafeInteger(item.priceUsdMinor) || item.priceUsdMinor < 0) return { ok: false, reason: "invalid" };
    let unit;
    try {
      unit = priceIn(item.priceUsdMinor, currency, tables);
    } catch {
      return { ok: false, reason: "noRate" };
    }
    if (!unit) return { ok: false, reason: "noRate" };
    const lineMinor = unit.amountMinor * item.quantity;
    const lineUsdMinor = item.priceUsdMinor * item.quantity;
    totalMinor += lineMinor;
    totalUsdMinor += lineUsdMinor;
    if (![lineMinor, lineUsdMinor, totalMinor, totalUsdMinor].every(Number.isSafeInteger)) return { ok: false, reason: "invalid" };
    lines.push({ ...item, position, unitMinor: unit.amountMinor, lineMinor, lineUsdMinor });
  }

  return {
    ok: true,
    quote: {
      currency,
      decimals: settings.decimals,
      fxRate: rate.rate,
      fxRateDate: rate.rateDate,
      markupBps: settings.markupBps,
      lines,
      totalUsdMinor,
      totalMinor,
    },
  };
}
