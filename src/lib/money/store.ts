import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createPublicServerClient, type ServerSupabaseClient as Client } from "@/lib/supabase/server";
import type { CurrencySettings } from "./convert";
import { BASE_CURRENCY, currencies, isCurrency, type Currency } from "./currencies";
import type { RatesStore } from "./rates-job";

// Bypasses RLS: only for the daily rates job, after the cron route's secret check. Null when not configured.
function serviceRoleClient(): Client | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type CurrencyConfig = CurrencySettings & { enabled: boolean };

export type DisplayRate = { rate: string; rateDate: string };

export type MoneyTables = {
  settings: Partial<Record<Currency, CurrencyConfig>>;
  displayRates: Partial<Record<Currency, DisplayRate>>;
};

// The latest display rate USD→X per currency; numeric goes out as text so a rate never passes through a float
async function latestDisplayRates(db: Client): Promise<Partial<Record<Currency, DisplayRate>>> {
  const quotes = currencies.filter((c) => c !== BASE_CURRENCY);
  const results = await Promise.all(
    quotes.map((quote) =>
      db
        .from("fx_rates")
        .select("quote, rate_date, rate::text")
        .eq("source", "display")
        .eq("base", BASE_CURRENCY)
        .eq("quote", quote)
        .order("rate_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );
  const rates: Partial<Record<Currency, DisplayRate>> = {};
  for (const result of results) {
    if (result.error) throw new Error(`fx_rates: ${result.error.message}`);
    const row = result.data;
    if (row && isCurrency(row.quote)) rates[row.quote] = { rate: row.rate, rateDate: row.rate_date };
  }
  return rates;
}

// The settings and the current display rate of every currency, read under RLS as a visitor.
// Throws when the database is not configured or unreachable.
export async function readMoneyTables(): Promise<MoneyTables> {
  const db = createPublicServerClient();
  const [settings, displayRates] = await Promise.all([db.from("currency_settings").select("*"), latestDisplayRates(db)]);
  if (settings.error) throw new Error(`currency_settings: ${settings.error.message}`);

  const tables: MoneyTables = { settings: {}, displayRates };
  for (const row of settings.data) {
    if (!isCurrency(row.currency)) continue;
    tables.settings[row.currency] = {
      decimals: row.decimals,
      markupBps: row.markup_bps,
      roundIncrement: row.round_increment,
      ending: row.ending,
      smallPriceBelow: row.small_price_below,
      smallRoundIncrement: row.small_round_increment,
      smallEnding: row.small_ending,
      enabled: row.enabled,
    };
  }
  return tables;
}

// The store of the daily rates job (service-role client). Null when the key is not configured.
export function createRatesStore(): RatesStore | null {
  const db = serviceRoleClient();
  if (!db) return null;

  return {
    async hysteresis() {
      const { data, error } = await db.from("currency_settings").select("currency, hysteresis_bps");
      if (error) throw new Error(`currency_settings: ${error.message}`);
      const result: Partial<Record<Currency, number>> = {};
      for (const row of data) if (isCurrency(row.currency)) result[row.currency] = row.hysteresis_bps;
      return result;
    },
    async displayRates() {
      const rates = await latestDisplayRates(db);
      return Object.fromEntries(Object.entries(rates).map(([quote, { rate }]) => [quote, rate]));
    },
    async upsert(rows) {
      if (rows.length === 0) return;
      const fetchedAt = new Date().toISOString();
      const { error } = await db.from("fx_rates").upsert(
        // PostgREST takes a numeric as a JSON string and keeps every digit; the generated type says number
        rows.map((row) => ({ ...row, rate: row.rate as unknown as number, fetched_at: fetchedAt })),
        { onConflict: "rate_date,base,quote,source" },
      );
      if (error) throw new Error(`fx_rates: ${error.message}`);
    },
  };
}
