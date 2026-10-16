import { describe, expect, it } from "vitest";
import type { ProductVariant } from "./types";
import { listPriceOf, mapVariants, pickVariantLabel, variantSku, type VariantRow } from "./variants";

const row = (id: string, overrides: Partial<VariantRow> = {}): VariantRow => ({
  id,
  position: 0,
  sku_suffix: null,
  price_delta_usd_minor: 0,
  is_available: true,
  product_variant_translations: [{ locale: "uk", label: id }],
  ...overrides,
});

const variant = (id: string, priceUsdMinor: number, available = true): ProductVariant => ({
  id,
  label: id,
  labelLocale: "en",
  skuSuffix: null,
  priceUsdMinor,
  regularPriceUsdMinor: priceUsdMinor,
  saleEndsAt: null,
  available,
});

// a price without a sale, and the list price it gives
const own = (usdMinor: number) => ({ usdMinor, regularUsdMinor: usdMinor, saleEndsAt: null });
const list = (usdMinor: number, from: boolean) => ({ ...own(usdMinor), from });

describe("pickVariantLabel", () => {
  const labels = [
    { locale: "uk", label: "17 розмір" },
    { locale: "en", label: "Size 17" },
    { locale: "de", label: "Größe 17" },
  ];

  it("takes the requested locale, then en, then uk", () => {
    expect(pickVariantLabel(labels, "de")).toEqual({ locale: "de", label: "Größe 17" });
    expect(pickVariantLabel(labels, "pl")).toEqual({ locale: "en", label: "Size 17" });
    expect(pickVariantLabel([labels[0]!], "pl")).toEqual({ locale: "uk", label: "17 розмір" });
  });

  it("takes any label rather than none, and none of no locale", () => {
    expect(pickVariantLabel([{ locale: "cs", label: "17" }], "pl")).toEqual({ locale: "cs", label: "17" });
    expect(pickVariantLabel([], "pl")).toBeNull();
    expect(pickVariantLabel([{ locale: "ru", label: "17" }], "pl")).toBeNull();
  });
});

describe("mapVariants", () => {
  it("orders by position and adds the difference to the product's price", () => {
    const variants = mapVariants(
      [row("b", { position: 1, price_delta_usd_minor: 250 }), row("a", { position: 0, sku_suffix: "16" })],
      2000,
      "en",
    );
    expect(variants).toEqual([
      { id: "a", label: "a", labelLocale: "uk", skuSuffix: "16", priceUsdMinor: 2000, regularPriceUsdMinor: 2000, saleEndsAt: null, available: true },
      { id: "b", label: "b", labelLocale: "uk", skuSuffix: null, priceUsdMinor: 2250, regularPriceUsdMinor: 2250, saleEndsAt: null, available: true },
    ]);
  });

  it("leaves out a variant without a label or without a price above zero", () => {
    expect(mapVariants([row("a", { product_variant_translations: [] })], 2000, "en")).toEqual([]);
    expect(mapVariants([row("a", { price_delta_usd_minor: -2000 })], 2000, "en")).toEqual([]);
    expect(mapVariants([row("a", { price_delta_usd_minor: -1999 })], 2000, "en")[0]?.priceUsdMinor).toBe(1);
  });
});

describe("listPriceOf", () => {
  it("is the product's own price without variants", () => {
    expect(listPriceOf(own(2000), [])).toEqual(list(2000, false));
  });

  it("is the lowest variant price, from when the prices differ", () => {
    expect(listPriceOf(own(2000), [variant("a", 2250), variant("b", 1900)])).toEqual(list(1900, true));
    expect(listPriceOf(own(2000), [variant("a", 2500), variant("b", 2500)])).toEqual(list(2500, false));
  });

  it("counts only the variants that can be ordered while there are any", () => {
    expect(listPriceOf(own(2000), [variant("a", 1500, false), variant("b", 2200)])).toEqual(list(2200, false));
    expect(listPriceOf(own(2000), [variant("a", 1500, false), variant("b", 2200, false)])).toEqual(list(1500, true));
  });

  it("keeps the product's own sale without variants, and the lowest size's sale with them (#67)", () => {
    const sale = { usdMinor: 1600, regularUsdMinor: 2000, saleEndsAt: "2026-10-20T00:00:00Z" };
    expect(listPriceOf(sale, [])).toEqual({ ...sale, from: false });
    const sized = [
      { ...variant("a", 1800), regularPriceUsdMinor: 2250, saleEndsAt: sale.saleEndsAt },
      { ...variant("b", 1600), regularPriceUsdMinor: 2000, saleEndsAt: sale.saleEndsAt },
    ];
    expect(listPriceOf(sale, sized)).toEqual({ ...sale, from: true });
  });
});

describe("mapVariants on sale (#67)", () => {
  it("prices every size under the running sale, its difference kept", () => {
    const sales = [{ percentOff: null, priceUsdMinor: 1500, startsAt: null, endsAt: null }];
    const variants = mapVariants([row("a"), row("b", { position: 1, price_delta_usd_minor: 250 })], 2000, "en", sales);
    expect(variants.map((v) => [v.id, v.priceUsdMinor, v.regularPriceUsdMinor])).toEqual([
      ["a", 1500, 2000],
      ["b", 1750, 2250],
    ]);
  });
});

describe("variantSku", () => {
  it("appends the suffix to the product's SKU", () => {
    expect(variantSku("TJS-R-001", "17.5")).toBe("TJS-R-001-17.5");
    expect(variantSku("TJS-R-001", null)).toBe("TJS-R-001");
    expect(variantSku(null, "17")).toBeNull();
  });
});
