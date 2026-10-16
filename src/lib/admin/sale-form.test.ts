import { describe, expect, it } from "vitest";
import { instantToKyivLocal, kyivLocalToInstant, parseSaleForm, saleState, type SaleFormInput } from "./sale-form";

const form = (overrides: Partial<SaleFormInput> = {}): SaleFormInput => ({
  kind: "percent",
  percent: "20",
  price: "",
  startsAt: "",
  endsAt: "",
  ...overrides,
});

describe("the sale window in Kyiv time", () => {
  it("converts Kyiv wall-clock time to the instant, summer and winter time", () => {
    expect(kyivLocalToInstant("2026-10-20T10:00")).toBe("2026-10-20T07:00:00.000Z");
    expect(kyivLocalToInstant("2026-12-01T00:00")).toBe("2026-11-30T22:00:00.000Z");
    expect(instantToKyivLocal("2026-10-20T07:00:00.000Z")).toBe("2026-10-20T10:00");
    expect(instantToKyivLocal("2026-11-30T22:00:00+00:00")).toBe("2026-12-01T00:00");
  });

  it("refuses anything that is not a date and time", () => {
    expect(kyivLocalToInstant("tomorrow")).toBeNull();
    expect(kyivLocalToInstant("2026-13-01T10:00")).toBeNull();
    expect(kyivLocalToInstant("2026-10-20")).toBeNull();
  });
});

describe("parseSaleForm", () => {
  it("stores a percentage with an open window", () => {
    expect(parseSaleForm(form(), "product", 2000)).toEqual({
      ok: true,
      sale: { percent_off: 20, price_usd_minor: null, starts_at: null, ends_at: null },
    });
  });

  it("stores a fixed price below the regular price, with its window", () => {
    const parsed = parseSaleForm(form({ kind: "price", price: "14.90", startsAt: "2026-10-20T10:00", endsAt: "2026-10-27T10:00" }), "product", 2000);
    expect(parsed).toEqual({
      ok: true,
      sale: { percent_off: null, price_usd_minor: 1490, starts_at: "2026-10-20T07:00:00.000Z", ends_at: "2026-10-27T08:00:00.000Z" },
    });
  });

  it("names the fields to fix", () => {
    expect(parseSaleForm(form({ percent: "" }), "product", 2000)).toEqual({ ok: false, fields: { percent: "required" } });
    expect(parseSaleForm(form({ percent: "100" }), "product", 2000)).toEqual({ ok: false, fields: { percent: "invalid" } });
    expect(parseSaleForm(form({ percent: "0" }), "product", 2000)).toEqual({ ok: false, fields: { percent: "invalid" } });
    expect(parseSaleForm(form({ kind: "price", price: "20" }), "product", 2000)).toEqual({ ok: false, fields: { price: "notBelowPrice" } });
    expect(parseSaleForm(form({ kind: "price", price: "abc" }), "product", 2000)).toEqual({ ok: false, fields: { price: "invalid" } });
    expect(parseSaleForm(form({ startsAt: "2026-10-27T10:00", endsAt: "2026-10-20T10:00" }), "product", 2000)).toEqual({
      ok: false,
      fields: { endsAt: "endBeforeStart" },
    });
    expect(parseSaleForm(form({ kind: "price", price: "9" }), "collection", null)).toEqual({
      ok: false,
      fields: { kind: "collectionPercentOnly" },
    });
  });
});

describe("saleState", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");
  it("is scheduled before its start, running inside its window, ended after its end", () => {
    expect(saleState({ startsAt: "2026-10-17T00:00:00Z", endsAt: null }, now)).toBe("scheduled");
    expect(saleState({ startsAt: null, endsAt: null }, now)).toBe("running");
    expect(saleState({ startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-16T12:00:00Z" }, now)).toBe("ended");
  });
});
