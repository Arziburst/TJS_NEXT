import { describe, expect, it } from "vitest";
import { labelSources, minorToDeltaText, parseVariantForm, usdDeltaToMinor } from "./variant-form";

describe("usdDeltaToMinor", () => {
  it.each([
    ["", 0],
    ["0", 0],
    ["5", 500],
    ["+5", 500],
    ["2.5", 250],
    ["-2.50", -250],
    ["−2,5", -250],
    [" 12.05 ", 1205],
  ])("%j -> %i", (text, minor) => {
    expect(usdDeltaToMinor(text)).toBe(minor);
  });

  it.each(["abc", "1.234", "--1", "1e3", "5$", "123456789"])("rejects %j", (text) => {
    expect(usdDeltaToMinor(text)).toBeNull();
  });
});

describe("minorToDeltaText", () => {
  it("writes a stored difference back as the editor shows it", () => {
    expect([0, 500, -250, 1205, -5].map(minorToDeltaText)).toEqual(["0", "5", "-2.50", "12.05", "-0.05"]);
    for (const minor of [0, 500, -250, 1205, -5]) expect(usdDeltaToMinor(minorToDeltaText(minor))).toBe(minor);
  });
});

describe("parseVariantForm", () => {
  const base = { labels: { uk: "17", en: " Size 17 ", de: "" }, priceDelta: "2.50", skuSuffix: "17" };

  it("keeps the filled labels, the difference in cents and the suffix", () => {
    expect(parseVariantForm(base, 2000)).toEqual({
      ok: true,
      input: {
        labels: [
          { locale: "uk", label: "17" },
          { locale: "en", label: "Size 17" },
        ],
        sku_suffix: "17",
        price_delta_usd_minor: 250,
      },
    });
    expect(parseVariantForm({ ...base, skuSuffix: " " }, 2000)).toMatchObject({ ok: true, input: { sku_suffix: null } });
  });

  it("requires the Ukrainian label and bounds every label", () => {
    expect(parseVariantForm({ ...base, labels: { en: "17" } }, 2000)).toEqual({ ok: false, fields: { "label.uk": "labelRequired" } });
    expect(parseVariantForm({ ...base, labels: { uk: "x".repeat(101) } }, 2000)).toEqual({ ok: false, fields: { "label.uk": "tooLong" } });
  });

  it("keeps the size's price above zero", () => {
    expect(parseVariantForm({ ...base, priceDelta: "-20" }, 2000)).toEqual({ ok: false, fields: { priceDelta: "priceNotPositive" } });
    expect(parseVariantForm({ ...base, priceDelta: "-19.99" }, 2000)).toMatchObject({ ok: true, input: { price_delta_usd_minor: -1999 } });
    expect(parseVariantForm({ ...base, priceDelta: "five" }, 2000)).toEqual({ ok: false, fields: { priceDelta: "invalidDelta" } });
  });

  it("takes a suffix of letters and digits with dots or hyphens", () => {
    expect(parseVariantForm({ ...base, skuSuffix: "17.5" }, 2000)).toMatchObject({ ok: true, input: { sku_suffix: "17.5" } });
    expect(parseVariantForm({ ...base, skuSuffix: "17 5" }, 2000)).toEqual({ ok: false, fields: { skuSuffix: "invalidSuffix" } });
    expect(parseVariantForm({ ...base, skuSuffix: "-17" }, 2000)).toEqual({ ok: false, fields: { skuSuffix: "invalidSuffix" } });
  });
});

describe("labelSources (#102)", () => {
  const stored = [
    { locale: "uk", label: "18", source: "human" as const },
    { locale: "en", label: "18 mm", source: "machine" as const },
    { locale: "de", label: "18 mm", source: "machine" as const },
  ];

  it("keeps the source of a label the admin did not change; an edited or new one is human", () => {
    expect(
      labelSources(
        [
          { locale: "uk", label: "18" },
          { locale: "en", label: "18 mm" },
          { locale: "de", label: "18 Millimeter" },
          { locale: "fr", label: "18 mm" },
        ],
        stored,
      ),
    ).toEqual([
      { locale: "uk", label: "18", source: "human" },
      { locale: "en", label: "18 mm", source: "machine" },
      { locale: "de", label: "18 Millimeter", source: "human" },
      { locale: "fr", label: "18 mm", source: "human" },
    ]);
  });

  it("makes every label of a new size human", () => {
    expect(labelSources([{ locale: "uk", label: "19" }], [])).toEqual([{ locale: "uk", label: "19", source: "human" }]);
  });
});
