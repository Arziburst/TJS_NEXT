import "server-only";

import type { Locale } from "@/i18n/routing";
import { amountToMinor, usdBoundsFor } from "@/lib/catalog/price-filter";
import type { ListingFilters } from "@/lib/catalog/types";
import { getMoneyTables } from "@/lib/money/cache";
import type { Currency } from "@/lib/money/currencies";
import { getCurrencyChoice } from "@/lib/money/prices";
import { searchTerms } from "@/lib/search/query";
import type { ListingState } from "./shop-query";

export type PriceContext = {
  /** The currency of the price inputs: the one the URL's range was set in, else the visitor's display currency. */
  currency: Currency;
  /** False when the range could not be converted (no rate for its currency): the listing is then unfiltered by price. */
  applied: boolean;
};

/**
 * The database filters of a listing's URL state. Request-time: the price range is converted from the
 * visitor's display currency (or the URL's `cur`) to USD bounds with the displayed price itself
 * (src/lib/catalog/price-filter.ts), so render the callers inside <Suspense>. The result is canonical and
 * the same for every visitor with the same URL and currency: it keys the shared listing cache.
 */
export async function listingFiltersFor(
  locale: Locale,
  categorySlug: string | null,
  state: ListingState,
): Promise<{ filters: ListingFilters; price: PriceContext }> {
  const { filters } = state;
  const [choice, tables] = await Promise.all([getCurrencyChoice(), getMoneyTables()]);
  const currency = filters.price.currency !== null && choice.options.includes(filters.price.currency) ? filters.price.currency : choice.current;

  let priceMinUsdMinor: number | null = null;
  let priceMaxUsdMinor: number | null = null;
  let applied = true;
  if (filters.price.min !== null || filters.price.max !== null) {
    const decimals = tables?.settings[currency]?.decimals;
    const min = filters.price.min === null || decimals === undefined ? null : amountToMinor(filters.price.min, decimals);
    const max = filters.price.max === null || decimals === undefined ? null : amountToMinor(filters.price.max, decimals);
    const bounds = tables && decimals !== undefined ? usdBoundsFor(min, max, currency, tables) : null;
    if (bounds) {
      priceMinUsdMinor = bounds.minUsdMinor;
      priceMaxUsdMinor = bounds.maxUsdMinor;
    } else {
      applied = false;
    }
  }

  return {
    filters: {
      locale,
      categorySlug,
      terms: state.context === "search" ? searchTerms(state.q) : [],
      materials: filters.materials,
      colours: filters.colours,
      priceMinUsdMinor,
      priceMaxUsdMinor,
      availability: filters.availability,
    },
    price: { currency, applied },
  };
}
