import { describe, expect, it } from "vitest";
import { isOnSale, isRunning, lifeUntilSaleChange, offerFor, saleFromRow, type Sale } from "./sale";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const percent = (percentOff: number, window: Partial<Pick<Sale, "startsAt" | "endsAt">> = {}): Sale => ({
  percentOff,
  priceUsdMinor: null,
  startsAt: window.startsAt ?? null,
  endsAt: window.endsAt ?? null,
});
const fixed = (priceUsdMinor: number, window: Partial<Pick<Sale, "startsAt" | "endsAt">> = {}): Sale => ({
  percentOff: null,
  priceUsdMinor,
  startsAt: window.startsAt ?? null,
  endsAt: window.endsAt ?? null,
});

describe("the sale price", () => {
  it("is the regular price without a sale", () => {
    expect(offerFor(2000, 0, [], NOW)).toEqual({ usdMinor: 2000, regularUsdMinor: 2000, saleEndsAt: null });
  });

  it("takes a percentage off, rounded to the cent half up", () => {
    expect(offerFor(2000, 0, [percent(20)], NOW).usdMinor).toBe(1600);
    // 2250 × 0.85 = 1912.5 → 1913; 999 × 0.67 = 669.33 → 669
    expect(offerFor(2000, 250, [percent(15)], NOW).usdMinor).toBe(1913);
    expect(offerFor(999, 0, [percent(33)], NOW).usdMinor).toBe(669);
  });

  it("applies to every size with its difference kept", () => {
    const sales = [fixed(1500)];
    expect(offerFor(2000, 0, sales, NOW)).toEqual({ usdMinor: 1500, regularUsdMinor: 2000, saleEndsAt: null });
    expect(offerFor(2000, 250, sales, NOW)).toEqual({ usdMinor: 1750, regularUsdMinor: 2250, saleEndsAt: null });
    expect(offerFor(2000, -300, sales, NOW)).toEqual({ usdMinor: 1200, regularUsdMinor: 1700, saleEndsAt: null });
    // a percentage of each size's own price
    expect(offerFor(2000, 500, [percent(10)], NOW).usdMinor).toBe(2250);
  });

  it("runs only inside its time window: from its start, until its end", () => {
    const window = { startsAt: "2026-10-16T12:00:00Z", endsAt: "2026-10-17T00:00:00Z" };
    expect(offerFor(2000, 0, [percent(20, window)], NOW - 1).usdMinor).toBe(2000);
    expect(offerFor(2000, 0, [percent(20, window)], NOW)).toEqual({ usdMinor: 1600, regularUsdMinor: 2000, saleEndsAt: window.endsAt });
    expect(offerFor(2000, 0, [percent(20, window)], Date.parse(window.endsAt) - 1).usdMinor).toBe(1600);
    expect(offerFor(2000, 0, [percent(20, window)], Date.parse(window.endsAt)).usdMinor).toBe(2000);
    expect(isRunning(percent(20, { endsAt: "2026-10-16T11:59:59Z" }), NOW)).toBe(false);
    expect(isRunning(percent(20, { startsAt: "2026-10-01T00:00:00Z" }), NOW)).toBe(true);
  });

  it("is the lowest of several running sales", () => {
    const product = fixed(1500, { endsAt: "2026-10-20T00:00:00Z" });
    const collection = percent(30, { endsAt: "2026-10-18T00:00:00Z" });
    expect(offerFor(2000, 0, [product, collection], NOW)).toEqual({ usdMinor: 1400, regularUsdMinor: 2000, saleEndsAt: collection.endsAt });
    // for a dearer size the fixed price (with the difference) beats the percentage
    expect(offerFor(2000, 1000, [product, collection], NOW).usdMinor).toBe(2100);
  });

  it("is never above the regular price nor below 1 cent", () => {
    expect(offerFor(1000, 0, [fixed(5000)], NOW)).toEqual({ usdMinor: 1000, regularUsdMinor: 1000, saleEndsAt: null });
    expect(offerFor(40, -39, [fixed(1)], NOW).usdMinor).toBe(1);
    expect(offerFor(1, 0, [percent(99)], NOW).usdMinor).toBe(1);
    expect(isOnSale(offerFor(1, 0, [percent(99)], NOW))).toBe(false);
    expect(offerFor(0, 0, [percent(50)], NOW).usdMinor).toBe(0);
  });

  it("ignores a malformed sale", () => {
    expect(offerFor(2000, 0, [percent(100), percent(0), fixed(0), { ...fixed(1), priceUsdMinor: null }], NOW).usdMinor).toBe(2000);
  });

  it("bounds a cached entry's life by the next sale change", () => {
    expect(lifeUntilSaleChange(3600, null, NOW)).toBeNull();
    expect(lifeUntilSaleChange(3600, NOW + 3_600_000, NOW)).toBeNull();
    expect(lifeUntilSaleChange(3600, NOW + 600_500, NOW)).toEqual({ stale: 300, revalidate: 601, expire: 601 });
    expect(lifeUntilSaleChange(86_400, NOW + 20_000, NOW)).toEqual({ stale: 20, revalidate: 20, expire: 20 });
    expect(lifeUntilSaleChange(86_400, NOW - 5_000, NOW)).toEqual({ stale: 1, revalidate: 1, expire: 1 });
  });

  it("reads a database row", () => {
    expect(saleFromRow({ percent_off: 20, starts_at: null, ends_at: "2026-10-20T00:00:00+00:00" })).toEqual(
      percent(20, { endsAt: "2026-10-20T00:00:00+00:00" }),
    );
  });
});
