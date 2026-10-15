import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MoneyTables } from "./store";

vi.mock("server-only", () => ({}));

const getMoneyTables = vi.fn<() => Promise<MoneyTables | null>>();
vi.mock("./cache", () => ({ getMoneyTables: () => getMoneyTables() }));

// A visitor in Switzerland whose switcher cookie says CZK, browsing /de
const cookies = vi.fn(async () => ({ get: (name: string) => (name === "TJS_CURRENCY" ? { value: "CZK" } : undefined) }));
const headers = vi.fn(async () => new Headers({ "x-vercel-ip-country": "CH" }));
vi.mock("next/headers", () => ({ cookies: () => cookies(), headers: () => headers() }));
const getLocale = vi.fn(async () => "de");
vi.mock("next-intl/server", () => ({ getLocale: () => getLocale() }));

const { formatPrice, getCurrencyChoiceFor, getJsonLdPrice } = await import("./prices");

// The rows of the money migration and the seeded NBU rates of 2026-10-15
const whole = { decimals: 2, markupBps: 300, roundIncrement: 1000, ending: 900, enabled: true };
const wholeOnly = { ...whole, smallPriceBelow: null, smallRoundIncrement: null, smallEnding: null };
const twoTiers = { ...whole, smallPriceBelow: 10000, smallRoundIncrement: 100, smallEnding: 90 };
const rate = (value: string) => ({ rate: value, rateDate: "2026-10-15" });
const TABLES: MoneyTables = {
  settings: { UAH: wholeOnly, EUR: twoTiers, USD: twoTiers, PLN: wholeOnly, CZK: wholeOnly, RON: wholeOnly, CHF: twoTiers },
  displayRates: {
    UAH: rate("44.9801"),
    EUR: rate("0.8934319589"),
    PLN: rate("3.9012376731"),
    CZK: rate("21.7621075040"),
    RON: rate("4.7745013746"),
    CHF: rate("0.8331206392"),
  },
};

beforeEach(() => {
  getMoneyTables.mockResolvedValue(TABLES);
  getLocale.mockClear();
  cookies.mockClear();
  headers.mockClear();
});

describe("getJsonLdPrice", () => {
  it.each([
    ["pl", 3200, { price: "129.00", priceCurrency: "PLN" }],
    ["de", 3200, { price: "29.90", priceCurrency: "EUR" }],
    ["uk", 2780, { price: "1289.00", priceCurrency: "UAH" }],
    ["en", 2900, { price: "29.90", priceCurrency: "USD" }],
    ["cs", 3300, { price: "749.00", priceCurrency: "CZK" }],
  ] as const)("%s, %i cents → %j", async (locale, usdMinor, expected) => {
    await expect(getJsonLdPrice(usdMinor, locale)).resolves.toEqual(expected);
  });

  it("ignores the visitor's cookie and country: the same for every visitor and crawler", async () => {
    await getJsonLdPrice(3200, "pl");
    expect(cookies).not.toHaveBeenCalled();
    expect(headers).not.toHaveBeenCalled();
    // the same request's visible price follows the cookie instead
    await expect(formatPrice(3300)).resolves.toMatchObject({ currency: "CZK", amountMinor: 74900 });
  });

  it("is null without rates", async () => {
    getMoneyTables.mockResolvedValue(null);
    await expect(getJsonLdPrice(3200, "pl")).resolves.toBeNull();
  });

  it("is null when the locale's currency has no display rate yet", async () => {
    getMoneyTables.mockResolvedValue({ ...TABLES, displayRates: { ...TABLES.displayRates, PLN: undefined } });
    await expect(getJsonLdPrice(3200, "pl")).resolves.toBeNull();
  });
});

describe("getCurrencyChoiceFor (callers without a route locale, e.g. Server Actions)", () => {
  it("resolves the visitor's currency for the given locale without reading the route locale", async () => {
    const choice = await getCurrencyChoiceFor("pl");
    expect(choice.current).toBe("CZK");
    expect(choice.tables).toBe(TABLES);
    expect(getLocale).not.toHaveBeenCalled();
  });

  it("falls back to the geo country, then to the given locale's default (D5)", async () => {
    cookies.mockResolvedValueOnce({ get: () => undefined });
    await expect(getCurrencyChoiceFor("pl")).resolves.toMatchObject({ current: "CHF" });
    cookies.mockResolvedValueOnce({ get: () => undefined });
    headers.mockResolvedValueOnce(new Headers());
    await expect(getCurrencyChoiceFor("pl")).resolves.toMatchObject({ current: "PLN" });
  });
});
