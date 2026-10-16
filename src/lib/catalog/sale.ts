// Sales (#67, D29): pure pricing, shared by the catalog, the cart and their tests. The same rule as the database's
// private.sale_price_minor (supabase/migrations/…_collections_and_sales.sql), which filters and sorts the listing:
// a running sale lowers a price (a size's price with its difference kept), the lowest of several sales wins, a
// percentage is rounded to the cent half up, and a sale price is never above the regular price nor below 1 cent.

/** A product's own sale (a percentage or a fixed price) or its collection's (a percentage), with its window. */
export type Sale = {
  percentOff: number | null;
  /** The fixed sale price of the product itself, in US cents; a size adds its difference. */
  priceUsdMinor: number | null;
  startsAt: string | null;
  endsAt: string | null;
};

/** A price as the shopper pays it now, and the regular price it is struck through against while a sale runs. */
export type PriceOffer = {
  usdMinor: number;
  regularUsdMinor: number;
  /** The end of the sale that gave `usdMinor`; null without a sale or for a sale without an end. */
  saleEndsAt: string | null;
};

export type SaleRow = { percent_off: number | null; price_usd_minor?: number | null; starts_at: string | null; ends_at: string | null };

export function saleFromRow(row: SaleRow): Sale {
  return { percentOff: row.percent_off, priceUsdMinor: row.price_usd_minor ?? null, startsAt: row.starts_at, endsAt: row.ends_at };
}

/** Whether the sale runs at `now` (ms): from its start (inclusive) until its end (exclusive). */
export function isRunning(sale: Sale, now: number): boolean {
  return (sale.startsAt === null || Date.parse(sale.startsAt) <= now) && (sale.endsAt === null || Date.parse(sale.endsAt) > now);
}

/** One sale's price for a regular price of `regularUsdMinor` = the product's price + `deltaUsdMinor`. */
function priceUnder(sale: Sale, regularUsdMinor: number, deltaUsdMinor: number): number | null {
  if (sale.percentOff !== null) {
    if (!Number.isSafeInteger(sale.percentOff) || sale.percentOff < 1 || sale.percentOff > 99) return null;
    return Math.max(1, Math.floor((regularUsdMinor * (100 - sale.percentOff) + 50) / 100));
  }
  if (sale.priceUsdMinor !== null && Number.isSafeInteger(sale.priceUsdMinor) && sale.priceUsdMinor > 0) {
    return Math.max(1, sale.priceUsdMinor + deltaUsdMinor);
  }
  return null;
}

/**
 * The price of the product's own price (`deltaUsdMinor` 0) or of one of its sizes at `now`, with the sales that
 * apply to the product (its own and its published collections').
 */
export function offerFor(productPriceUsdMinor: number, deltaUsdMinor: number, sales: readonly Sale[], now: number): PriceOffer {
  const regularUsdMinor = productPriceUsdMinor + deltaUsdMinor;
  let best: { usdMinor: number; endsAt: string | null } | null = null;
  for (const sale of sales) {
    if (!isRunning(sale, now)) continue;
    const price = priceUnder(sale, regularUsdMinor, deltaUsdMinor);
    if (price === null || price >= regularUsdMinor || !Number.isSafeInteger(price)) continue;
    if (best === null || price < best.usdMinor || (price === best.usdMinor && endsLater(sale.endsAt, best.endsAt))) {
      best = { usdMinor: price, endsAt: sale.endsAt };
    }
  }
  return best ? { usdMinor: best.usdMinor, regularUsdMinor, saleEndsAt: best.endsAt } : { usdMinor: regularUsdMinor, regularUsdMinor, saleEndsAt: null };
}

// of two sales giving the same price, the one running longer states the price's validity
function endsLater(a: string | null, b: string | null): boolean {
  if (b === null) return false;
  return a === null || Date.parse(a) > Date.parse(b);
}

export type CacheLifeProfile = { stale: number; revalidate: number; expire: number };

/**
 * A cached entry with prices lives no longer than until the next sale starts or ends: the lifetime ending then
 * (stale, revalidate and expire at most that many seconds, so no stale copy outlives it), or null to keep the
 * entry's own profile (no change within its `revalidateSeconds`).
 */
export function lifeUntilSaleChange(revalidateSeconds: number, nextChange: number | null, now: number): CacheLifeProfile | null {
  if (nextChange === null) return null;
  const seconds = Math.max(1, Math.ceil((nextChange - now) / 1000));
  if (seconds >= revalidateSeconds) return null;
  return { stale: Math.min(300, seconds), revalidate: seconds, expire: seconds };
}

/** Whether the offer is a sale (the regular price is shown struck through). */
export function isOnSale(offer: Pick<PriceOffer, "usdMinor" | "regularUsdMinor">): boolean {
  return offer.usdMinor < offer.regularUsdMinor;
}
