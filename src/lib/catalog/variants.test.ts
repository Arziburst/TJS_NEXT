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
  available,
});

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
      { id: "a", label: "a", labelLocale: "uk", skuSuffix: "16", priceUsdMinor: 2000, available: true },
      { id: "b", label: "b", labelLocale: "uk", skuSuffix: null, priceUsdMinor: 2250, available: true },
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
    expect(listPriceOf(2000, [])).toEqual({ usdMinor: 2000, from: false });
  });

  it("is the lowest variant price, from when the prices differ", () => {
    expect(listPriceOf(2000, [variant("a", 2250), variant("b", 1900)])).toEqual({ usdMinor: 1900, from: true });
    expect(listPriceOf(2000, [variant("a", 2500), variant("b", 2500)])).toEqual({ usdMinor: 2500, from: false });
  });

  it("counts only the variants that can be ordered while there are any", () => {
    expect(listPriceOf(2000, [variant("a", 1500, false), variant("b", 2200)])).toEqual({ usdMinor: 2200, from: false });
    expect(listPriceOf(2000, [variant("a", 1500, false), variant("b", 2200, false)])).toEqual({ usdMinor: 1500, from: true });
  });
});

describe("variantSku", () => {
  it("appends the suffix to the product's SKU", () => {
    expect(variantSku("TJS-R-001", "17.5")).toBe("TJS-R-001-17.5");
    expect(variantSku("TJS-R-001", null)).toBe("TJS-R-001");
    expect(variantSku(null, "17")).toBeNull();
  });
});
