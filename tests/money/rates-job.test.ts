import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Currency } from "@/lib/money/currencies";
import { fetchNbuRate, NBU_EXCHANGE_URL, NBU_USER_AGENT } from "@/lib/money/nbu";
import { refreshRates, type FxRow, type RatesStore } from "@/lib/money/rates-job";

// Recorded NBU answers (bank.gov.ua, 2026-10-15): one per currency, and the empty list NBU returns for a
// date it has not published yet.
function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/nbu/${name}.json`, import.meta.url), "utf8");
}

// 14:15 UTC on 2026-10-14 is 17:15 in Kyiv: the job asks for the next business day, 2026-10-15
const NOW = new Date("2026-10-14T14:15:00Z");

type Answer = string | { status: number; body?: string } | Error;

function nbu(overrides: Partial<Record<string, Answer>> = {}) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const currency = url.searchParams.get("valcode") ?? "";
    const answer = overrides[currency] ?? fixture(`${currency}-${url.searchParams.get("date")}`);
    if (answer instanceof Error) throw answer;
    if (typeof answer === "string") return new Response(answer, { status: 200 });
    return new Response(answer.body ?? "", { status: answer.status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function memoryStore(display: Partial<Record<Currency, string>> = {}) {
  const upserts: FxRow[][] = [];
  const hysteresis = { UAH: 150, EUR: 150, USD: 150, PLN: 150, CZK: 150, RON: 150, CHF: 150 };
  const store: RatesStore = {
    hysteresis: async () => hysteresis,
    displayRates: async () => display,
    upsert: async (rows) => {
      upserts.push(rows);
    },
  };
  return { store, upserts };
}

const row = (base: string, quote: string, rate: string, source: "nbu" | "display" = "nbu"): FxRow => ({
  rate_date: "2026-10-15",
  base,
  quote,
  rate,
  source,
});

const NBU_ROWS = [
  row("USD", "UAH", "44.9801"),
  row("EUR", "UAH", "50.3453"),
  row("USD", "EUR", "0.8934319589"),
  row("PLN", "UAH", "11.5297"),
  row("USD", "PLN", "3.9012376731"),
  row("CZK", "UAH", "2.0669"),
  row("USD", "CZK", "21.7621075040"),
  row("RON", "UAH", "9.4209"),
  row("USD", "RON", "4.7745013746"),
  row("CHF", "UAH", "53.9899"),
  row("USD", "CHF", "0.8331206392"),
];

describe("refreshRates with recorded NBU answers", () => {
  it("stores the NBU rates, the USD cross rates and the first display rates", async () => {
    const { fetchImpl } = nbu();
    const { store, upserts } = memoryStore();

    const result = await refreshRates({ now: NOW, store, fetchImpl });

    expect(result).toEqual({
      status: "ok",
      rateDate: "2026-10-15",
      stored: 17,
      displayChanged: ["UAH", "EUR", "PLN", "CZK", "RON", "CHF"],
      failures: [],
    });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toEqual([
      ...NBU_ROWS,
      row("USD", "UAH", "44.9801", "display"),
      row("USD", "EUR", "0.8934319589", "display"),
      row("USD", "PLN", "3.9012376731", "display"),
      row("USD", "CZK", "21.7621075040", "display"),
      row("USD", "RON", "4.7745013746", "display"),
      row("USD", "CHF", "0.8331206392", "display"),
    ]);
  });

  it("asks NBU for each currency on the next Kyiv day with a browser-like User-Agent", async () => {
    const { fetchImpl, calls } = nbu();
    await refreshRates({ now: NOW, store: memoryStore().store, fetchImpl });

    expect(calls.map((call) => call.url.searchParams.get("valcode"))).toEqual(["USD", "EUR", "PLN", "CZK", "RON", "CHF"]);
    for (const { url, init } of calls) {
      expect(`${url.origin}${url.pathname}`).toBe(NBU_EXCHANGE_URL);
      expect(url.searchParams.get("date")).toBe("20261015");
      expect(url.searchParams.has("json")).toBe(true);
      expect(new Headers(init?.headers).get("user-agent")).toBe(NBU_USER_AGENT);
      expect(NBU_USER_AGENT).toMatch(/^Mozilla\/5\.0 .*Chrome\/\d+/);
    }
  });

  it("uses the Kyiv date, not the server's: 23:30 UTC is already the next day in Kyiv", async () => {
    const { fetchImpl, calls } = nbu();
    await refreshRates({ now: new Date("2026-10-13T23:30:00Z"), store: memoryStore().store, fetchImpl });
    expect(calls[0].url.searchParams.get("date")).toBe("20261015");
  });

  it("keeps a display rate that moved no more than the hysteresis and moves one that moved more", async () => {
    const { fetchImpl } = nbu();
    // UAH: 44.9801 is 1.08 % above 44.5 → kept; EUR: 0.8934 is 5 % above 0.85 → moved; the rest unchanged
    const { store, upserts } = memoryStore({
      UAH: "44.5",
      EUR: "0.85",
      PLN: "3.9012376731",
      CZK: "21.7621075040",
      RON: "4.7745013746",
      CHF: "0.8331206392",
    });

    const result = await refreshRates({ now: NOW, store, fetchImpl });

    expect(result.status).toBe("ok");
    expect(result.displayChanged).toEqual(["EUR"]);
    expect(upserts[0]).toEqual([...NBU_ROWS, row("USD", "EUR", "0.8934319589", "display")]);
  });

  it("is idempotent: a second run on the same day changes no display rate", async () => {
    const first = memoryStore();
    await refreshRates({ now: NOW, store: first.store, fetchImpl: nbu().fetchImpl });
    const display = Object.fromEntries(
      first.upserts[0].filter((r) => r.source === "display").map((r) => [r.quote, r.rate]),
    );

    const second = memoryStore(display);
    const result = await refreshRates({ now: NOW, store: second.store, fetchImpl: nbu().fetchImpl });

    expect(result.displayChanged).toEqual([]);
    expect(second.upserts[0]).toEqual(NBU_ROWS);
  });
});

describe("refreshRates when NBU partly fails", () => {
  it("stores what arrived and leaves the failed currencies on their last stored rate", async () => {
    const { fetchImpl } = nbu({
      PLN: { status: 500 },
      CZK: new TypeError("fetch failed"),
      RON: fixture("USD-not-yet-published"),
      CHF: "<html>Service unavailable</html>",
    });
    const { store, upserts } = memoryStore({ PLN: "3.9", CZK: "21.7", RON: "4.7", CHF: "0.83" });

    const result = await refreshRates({ now: NOW, store, fetchImpl });

    expect(result).toEqual({
      status: "partial",
      rateDate: "2026-10-15",
      stored: 5,
      displayChanged: ["UAH", "EUR"],
      failures: [
        { currency: "PLN", reason: "http" },
        { currency: "CZK", reason: "network" },
        { currency: "RON", reason: "missing" },
        { currency: "CHF", reason: "invalid" },
      ],
    });
    expect(upserts[0]).toEqual([
      row("USD", "UAH", "44.9801"),
      row("EUR", "UAH", "50.3453"),
      row("USD", "EUR", "0.8934319589"),
      row("USD", "UAH", "44.9801", "display"),
      row("USD", "EUR", "0.8934319589", "display"),
    ]);
  });

  it("skips a rate published for another date", async () => {
    const eurOtherDay = fixture("EUR-20261015").replace("15.10.2026", "14.10.2026");
    const { fetchImpl } = nbu({ EUR: eurOtherDay });
    const { store, upserts } = memoryStore();

    const result = await refreshRates({ now: NOW, store, fetchImpl });

    expect(result.status).toBe("partial");
    expect(result.failures).toEqual([{ currency: "EUR", reason: "dateMismatch" }]);
    expect(upserts[0].some((r) => r.base === "EUR" || r.quote === "EUR")).toBe(false);
  });
});

describe("refreshRates when NBU fails", () => {
  it("stores nothing when the USD rate is not published yet", async () => {
    const { fetchImpl } = nbu({ USD: fixture("USD-not-yet-published") });
    const { store, upserts } = memoryStore();

    const result = await refreshRates({ now: NOW, store, fetchImpl });

    expect(result.status).toBe("failed");
    expect(result.stored).toBe(0);
    expect(result.failures).toContainEqual({ currency: "USD", reason: "missing" });
    expect(upserts).toEqual([]);
  });

  it("stores nothing on a network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const { store, upserts } = memoryStore();

    const result = await refreshRates({ now: NOW, store, fetchImpl });

    expect(result).toEqual({
      status: "failed",
      rateDate: null,
      stored: 0,
      displayChanged: [],
      failures: ["USD", "EUR", "PLN", "CZK", "RON", "CHF"].map((currency) => ({ currency, reason: "network" })),
    });
    expect(upserts).toEqual([]);
  });
});

describe("fetchNbuRate", () => {
  it("parses a recorded answer", async () => {
    const { fetchImpl } = nbu();
    await expect(fetchNbuRate("CHF", "2026-10-15", fetchImpl)).resolves.toEqual({
      ok: true,
      rate: { currency: "CHF", rate: "53.9899", rateDate: "2026-10-15" },
    });
  });

  it("gives up after a timeout", async () => {
    const { fetchImpl, calls } = nbu();
    await fetchNbuRate("USD", "2026-10-15", fetchImpl);
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["a negative rate", '[{"cc":"USD","rate":-1,"exchangedate":"15.10.2026"}]'],
    ["a rate as text", '[{"cc":"USD","rate":"44.98","exchangedate":"15.10.2026"}]'],
    ["a rate in exponent form", '[{"cc":"USD","rate":1e-7,"exchangedate":"15.10.2026"}]'],
    ["a malformed date", '[{"cc":"USD","rate":44.98,"exchangedate":"2026-10-15"}]'],
    ["an object", '{"error":"limit"}'],
  ])("rejects %s", async (_, body) => {
    const { fetchImpl } = nbu({ USD: body });
    await expect(fetchNbuRate("USD", "2026-10-15", fetchImpl)).resolves.toEqual({
      ok: false,
      currency: "USD",
      reason: "invalid",
    });
  });

  it("does not take another currency's row", async () => {
    const { fetchImpl } = nbu({ USD: fixture("EUR-20261015") });
    await expect(fetchNbuRate("USD", "2026-10-15", fetchImpl)).resolves.toEqual({
      ok: false,
      currency: "USD",
      reason: "missing",
    });
  });
});
