import { describe, expect, it, vi } from "vitest";
import type { NovaPostClient } from "@/lib/delivery/nova-post/client";
import { estimateDelivery, type EstimateDeps } from "@/lib/delivery/nova-post/quote";
import type { Parcel } from "@/lib/delivery/nova-post/types";
import type { ZoneRates } from "@/lib/delivery/nova-post/zone-rates";
import type { CurrencyConfig, MoneyTables } from "@/lib/money/store";

const cents: CurrencyConfig = {
  decimals: 2,
  markupBps: 300,
  roundIncrement: 1000,
  ending: 900,
  smallPriceBelow: 10000,
  smallRoundIncrement: 100,
  smallEnding: 90,
  enabled: true,
};
const tables: MoneyTables = {
  settings: { EUR: cents, CHF: cents, USD: cents },
  displayRates: { EUR: { rate: "0.86", rateDate: "2026-10-15" }, CHF: { rate: "0.8", rateDate: "2026-10-15" }, UAH: { rate: "41.5", rateDate: "2026-10-15" } },
};

const TBD: ZoneRates = { A: null, B: null, C: null };
const PARCEL: Parcel = {
  weightGrams: 100,
  lengthMm: 100,
  widthMm: 100,
  heightMm: 30,
  declaredValueMinor: 3000,
  declaredCurrency: "EUR",
  insuranceUahMinor: 120000,
};
const toLocker = { kind: "division", divisionId: 1834946 } as const;

function fakeClient(calculate: NovaPostClient["calculate"]): NovaPostClient {
  return { calculate: vi.fn(calculate), searchSettlements: vi.fn(), listDivisions: vi.fn() };
}

function deps(overrides: Partial<EstimateDeps> = {}): EstimateDeps {
  return { client: null, parcel: null, zoneRates: async () => TBD, tables, ...overrides };
}

describe("the delivery estimate abroad", () => {
  it("falls back to the zone flat rate, TBD, while the API is not configured", async () => {
    expect(await estimateDelivery({ country: "PL", destination: toLocker, currency: "EUR" }, deps())).toEqual({
      source: "flatRate",
      zone: "A",
      price: { state: "tbd" },
      reason: "notConfigured",
    });
  });

  it("converts a zone flat rate the owner has set into the display currency", async () => {
    const zoneRates = async (): Promise<ZoneRates> => ({ ...TBD, C: { currency: "USD", amountMinor: 1500 } });
    const destination = { kind: "address", city: "Bern", postCode: "3011", street: "Marktgasse", building: "1" } as const;
    expect(await estimateDelivery({ country: "CH", destination, currency: "CHF" }, deps({ zoneRates }))).toEqual({
      source: "flatRate",
      zone: "C",
      // 15 USD × 0.8 × 1.03 = 12.36 → 12.90
      price: { state: "amount", money: { currency: "CHF", amountMinor: 1290, decimals: 2 } },
      reason: "notConfigured",
    });
  });

  it("does not ask the API without a parcel", async () => {
    const client = fakeClient(async () => ({ ok: false, error: { kind: "timeout" } }));
    const estimate = await estimateDelivery({ country: "PL", destination: toLocker, currency: "EUR" }, deps({ client }));
    expect(estimate).toMatchObject({ source: "flatRate", reason: "noParcel" });
    expect(client.calculate).not.toHaveBeenCalled();
  });

  it("shows Nova Post's quote with its date when the API answers", async () => {
    const client = fakeClient(async () => ({
      ok: true,
      data: { price: { currency: "UAH", amountMinor: 45000 }, scheduledDeliveryDate: "2026-10-21T09:00:00.000000Z" },
    }));
    const estimate = await estimateDelivery({ country: "PL", destination: toLocker, currency: "EUR" }, deps({ client, parcel: PARCEL }));
    expect(estimate).toEqual({
      source: "carrier",
      zone: "A",
      price: { state: "amount", money: { currency: "EUR", amountMinor: 990, decimals: 2 } },
      carrierPrice: { currency: "UAH", amountMinor: 45000 },
      scheduledDeliveryDate: "2026-10-21T09:00:00.000000Z",
    });
    expect(client.calculate).toHaveBeenCalledWith({ country: "PL", destination: toLocker, parcel: PARCEL });
  });

  it("falls back to the flat rate when the API cannot quote", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = fakeClient(async () => ({ ok: false, error: { kind: "http", status: 422, detail: "x" } }));
    const destination = { kind: "address", city: "Paris", postCode: "75001", street: "Rue", building: "1" } as const;
    expect(await estimateDelivery({ country: "FR", destination, currency: "EUR" }, deps({ client, parcel: PARCEL }))).toEqual({
      source: "flatRate",
      zone: "A",
      price: { state: "tbd" },
      reason: "carrierFailed",
      failure: { kind: "http", status: 422, detail: "x" },
    });
  });

  it("falls back when the API quotes in a currency the shop does not show", async () => {
    const client = fakeClient(async () => ({ ok: true, data: { price: { currency: "HUF", amountMinor: 100 }, scheduledDeliveryDate: null } }));
    const estimate = await estimateDelivery({ country: "HU", destination: toLocker, currency: "EUR" }, deps({ client, parcel: PARCEL }));
    expect(estimate).toMatchObject({ source: "flatRate", zone: "A", reason: "carrierCurrency" });
  });

  it("shows the price as unavailable when the rates or the zone table cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const set = async (): Promise<ZoneRates> => ({ ...TBD, B: { currency: "EUR", amountMinor: 1200 } });
    const destination = { kind: "address", city: "Wien", postCode: "1010", street: "Graben", building: "1" } as const;
    const noRates = await estimateDelivery({ country: "AT", destination, currency: "EUR" }, deps({ zoneRates: set, tables: null }));
    expect(noRates).toMatchObject({ zone: "B", price: { state: "unavailable" } });
    const failing = async (): Promise<ZoneRates> => {
      throw new Error("down");
    };
    const noTable = await estimateDelivery({ country: "AT", destination, currency: "EUR" }, deps({ zoneRates: failing }));
    expect(noTable).toMatchObject({ zone: "B", price: { state: "unavailable" } });
  });
});
