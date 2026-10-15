import { z } from "zod";
import { parseDecimal } from "./decimal";

// National Bank of Ukraine official rates, UAH per unit (free, attribution). After 15:30 Kyiv it publishes the
// rate for the next business day.
export const NBU_EXCHANGE_URL = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange";

// NBU answers bare server clients with errors; a browser-like User-Agent is what it serves reliably
export const NBU_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const NBU_TIMEOUT_MS = 10_000;

const nbuResponseSchema = z.array(
  z.object({
    cc: z.string(),
    rate: z.number().positive(),
    exchangedate: z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/),
  }),
);

export type NbuRate = { currency: string; rate: string; rateDate: string };

export type NbuFailureReason = "network" | "http" | "invalid" | "missing";

export type NbuResult = { ok: true; rate: NbuRate } | { ok: false; currency: string; reason: NbuFailureReason };

// "16.10.2026" → "2026-10-16"
function isoDate(nbuDate: string): string {
  const [day, month, year] = nbuDate.split(".");
  return `${year}-${month}-${day}`;
}

// The rate of `currency` in UAH valid on `date` (YYYY-MM-DD)
export async function fetchNbuRate(currency: string, date: string, fetchImpl: typeof fetch = fetch): Promise<NbuResult> {
  const url = `${NBU_EXCHANGE_URL}?valcode=${encodeURIComponent(currency)}&date=${date.replaceAll("-", "")}&json`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { "User-Agent": NBU_USER_AGENT, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(NBU_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, currency, reason: "network" };
  }
  if (!response.ok) return { ok: false, currency, reason: "http" };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, currency, reason: "invalid" };
  }
  const parsed = nbuResponseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, currency, reason: "invalid" };

  const row = parsed.data.find((item) => item.cc === currency);
  if (!row) return { ok: false, currency, reason: "missing" };

  // JSON numbers print back as their shortest decimal form (44.9801); anything else is not a rate we store
  const rate = String(row.rate);
  if (!parseDecimal(rate)) return { ok: false, currency, reason: "invalid" };

  return { ok: true, rate: { currency, rate, rateDate: isoDate(row.exchangedate) } };
}
