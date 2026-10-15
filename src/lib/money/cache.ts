import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { FAILED_READ_LIFE } from "@/lib/failed-read";
import { readMoneyTables, type MoneyTables } from "./store";

// Revalidated by the daily rates job (src/app/api/cron/fx-rates); never fetched per request
export const FX_CACHE_TAG = "fx";

// Shared by every visitor: the tables hold no per-user data. Null when the database is not configured or
// unreachable; prices then show "—".
export async function getMoneyTables(): Promise<MoneyTables | null> {
  "use cache";
  cacheTag(FX_CACHE_TAG);
  try {
    const tables = await readMoneyTables();
    cacheLife("days");
    return tables;
  } catch (error) {
    console.error("money: rates unavailable", error);
    // a failure is read again by the next request instead of hiding prices for days, and is never baked into
    // a prerender (a build without the database still succeeds)
    cacheLife(FAILED_READ_LIFE);
    return null;
  }
}
