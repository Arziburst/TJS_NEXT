// The parcel of a cart (D35, D37) and the quote from the recorded tariffs.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNovaPoshtaClient, type NovaPoshtaRequest } from "@/lib/delivery/nova-poshta/api";
import {
  NP_MIN_WEIGHT_GRAMS,
  PACKAGING_BOX_CM,
  PACKAGING_VOLUME_CM3,
  PACKAGING_WEIGHT_GRAMS,
  PAYER,
  SENDER_CITY_REF,
  SENDER_SERVICE,
  parcelFromCart,
  serviceType,
} from "@/lib/delivery/nova-poshta/parcel";
import { quoteDelivery } from "@/lib/delivery/nova-poshta/quote";
import { KYIV, LVIV, replayTransport } from "./replay";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parcel parameters", () => {
  it("ships from Kyiv and lets the recipient pay (D35)", () => {
    expect(SENDER_CITY_REF).toBe(KYIV.cityRef);
    expect(PAYER).toBe("Recipient");
  });

  it("hands parcels in at a branch and quotes a small box of 10 × 10 × 5 cm and 100 g (D37)", () => {
    expect(SENDER_SERVICE).toBe("Warehouse");
    expect(PACKAGING_WEIGHT_GRAMS).toBe(100);
    expect(PACKAGING_BOX_CM).toEqual({ length: 10, width: 10, height: 5 });
    expect(PACKAGING_VOLUME_CM3).toBe(500);
  });

  it.each([
    ["warehouse", "WarehouseWarehouse"],
    ["postomat", "WarehousePostomat"],
    ["doors", "WarehouseDoors"],
  ] as const)("a %s recipient is service type %s", (recipient, type) => {
    expect(serviceType(recipient)).toBe(type);
  });
});

describe("parcelFromCart", () => {
  it("sums weight over quantities plus the box, and the declared value is the order total (D35, D37)", () => {
    expect(
      parcelFromCart([
        { weightGrams: 35.5, quantity: 2, unitPriceUahMinor: 128900 },
        { weightGrams: 120, quantity: 1, unitPriceUahMinor: 74900 },
      ]),
    ).toEqual({ weightGrams: 291, declaredValueMinor: 332700 });
  });

  it("never goes below the API's minimum weight", () => {
    expect(parcelFromCart([{ weightGrams: 0, quantity: 1, unitPriceUahMinor: 50000 }])).toEqual({
      weightGrams: Math.max(NP_MIN_WEIGHT_GRAMS, PACKAGING_WEIGHT_GRAMS),
      declaredValueMinor: 50000,
    });
  });

  it.each([
    [{ weightGrams: -1, quantity: 1, unitPriceUahMinor: 1 }],
    [{ weightGrams: Number.NaN, quantity: 1, unitPriceUahMinor: 1 }],
    [{ weightGrams: 10, quantity: 0, unitPriceUahMinor: 1 }],
    [{ weightGrams: 10, quantity: 1.5, unitPriceUahMinor: 1 }],
    [{ weightGrams: 10, quantity: 1, unitPriceUahMinor: 0.5 }],
    [{ weightGrams: 10, quantity: 2, unitPriceUahMinor: Number.MAX_SAFE_INTEGER }],
  ])("refuses an impossible line %o", (line) => {
    expect(parcelFromCart([line])).toBeNull();
  });
});

describe("quoteDelivery", () => {
  it("asks getDocumentPrice from Kyiv for the parcel and returns the tariff in kopiykas", async () => {
    const sent: NovaPoshtaRequest[] = [];
    const client = createNovaPoshtaClient({ transport: replayTransport(sent) });
    const result = await quoteDelivery(
      { cityRef: LVIV.cityRef, recipient: "doors", parcel: { weightGrams: 1000, declaredValueMinor: 128900 } },
      { client },
    );
    expect(result).toEqual({ ok: true, costMinor: 15645 });
    expect(sent[0].methodProperties).toEqual({
      CitySender: KYIV.cityRef,
      CityRecipient: LVIV.cityRef,
      Weight: "1",
      VolumeGeneral: "0.0005",
      ServiceType: "WarehouseDoors",
      Cost: "1289",
      CargoType: "Parcel",
      SeatsAmount: "1",
    });
  });

  it("is unavailable when the API refuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createNovaPoshtaClient({ transport: replayTransport() });
    const result = await quoteDelivery(
      {
        cityRef: "00000000-0000-0000-0000-000000000000",
        recipient: "warehouse",
        parcel: { weightGrams: 500, declaredValueMinor: 128900 },
      },
      { client },
    );
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });
});
