import { businessDate } from "./business-date";
import { crossRate, nextDisplayRate } from "./convert";
import { BASE_CURRENCY, currencies, type Currency } from "./currencies";
import { fetchNbuRate, type NbuFailureReason, type NbuRate } from "./nbu";

export type FxRow = {
  rate_date: string;
  base: string;
  quote: string;
  rate: string;
  source: "nbu" | "display";
};

// What the job needs from the database; the Supabase implementation lives in ./store
export type RatesStore = {
  // hysteresis_bps of every currency in currency_settings
  hysteresis(): Promise<Partial<Record<Currency, number>>>;
  // the latest display rate USD→X per currency
  displayRates(): Promise<Partial<Record<Currency, string>>>;
  // insert, or update on (rate_date, base, quote, source)
  upsert(rows: FxRow[]): Promise<void>;
};

export type RefreshFailure = { currency: string; reason: NbuFailureReason | "dateMismatch" };

export type RefreshResult = {
  // ok: every rate stored; partial: some kept their last stored rate; failed: nothing stored
  status: "ok" | "partial" | "failed";
  rateDate: string | null;
  stored: number;
  displayChanged: Currency[];
  failures: RefreshFailure[];
};

const DOMESTIC: Currency = "UAH";

// Every rate is fetched against UAH; USD first, since every cross rate needs it
const FETCHED = [BASE_CURRENCY, ...currencies.filter((c) => c !== BASE_CURRENCY && c !== DOMESTIC)];

/*
 * The daily rates job: fetch the NBU rates for the next Kyiv business day, store them with the USD→X cross
 * rates, and move a display rate only when its cross rate moved beyond the hysteresis. A currency whose
 * rate fails keeps its last stored rate; without the USD rate nothing is stored.
 */
export async function refreshRates({
  now,
  store,
  fetchImpl = fetch,
}: {
  now: Date;
  store: RatesStore;
  fetchImpl?: typeof fetch;
}): Promise<RefreshResult> {
  const date = businessDate(now, 1);
  const results = await Promise.all(FETCHED.map((currency) => fetchNbuRate(currency, date, fetchImpl)));

  const failures: RefreshFailure[] = [];
  const fetched: NbuRate[] = [];
  for (const result of results) {
    if (result.ok) fetched.push(result.rate);
    else failures.push({ currency: result.currency, reason: result.reason });
  }

  const usd = fetched.find((rate) => rate.currency === BASE_CURRENCY);
  if (!usd) return { status: "failed", rateDate: null, stored: 0, displayChanged: [], failures };

  const rows: FxRow[] = [];
  // USD→UAH is the NBU rate itself
  const crossRates: Partial<Record<Currency, string>> = { [DOMESTIC]: usd.rate };
  for (const rate of fetched) {
    if (rate.rateDate !== usd.rateDate) {
      failures.push({ currency: rate.currency, reason: "dateMismatch" });
      continue;
    }
    rows.push({ rate_date: rate.rateDate, base: rate.currency, quote: DOMESTIC, rate: rate.rate, source: "nbu" });
    if (rate.currency !== BASE_CURRENCY) {
      const cross = crossRate(usd.rate, rate.rate);
      crossRates[rate.currency as Currency] = cross;
      rows.push({ rate_date: rate.rateDate, base: BASE_CURRENCY, quote: rate.currency, rate: cross, source: "nbu" });
    }
  }

  const [hysteresis, displayRates] = await Promise.all([store.hysteresis(), store.displayRates()]);
  const displayChanged: Currency[] = [];
  for (const [quote, cross] of Object.entries(crossRates) as [Currency, string][]) {
    const bps = hysteresis[quote];
    if (bps === undefined) continue;
    const current = displayRates[quote] ?? null;
    const next = nextDisplayRate(current, cross, bps);
    if (next !== current) {
      displayChanged.push(quote);
      rows.push({ rate_date: usd.rateDate, base: BASE_CURRENCY, quote, rate: next, source: "display" });
    }
  }

  await store.upsert(rows);

  return {
    status: failures.length === 0 ? "ok" : "partial",
    rateDate: usd.rateDate,
    stored: rows.length,
    displayChanged,
    failures,
  };
}
