import { describe, expect, it } from "vitest";
import { productSlugFor, resolveProductPath, type SlugMatch } from "./product-path";

const earrings = [
  { locale: "en", slug: "coral-drop-earrings" },
  { locale: "uk", slug: "serezhky-krapli-z-koralom" },
  { locale: "de", slug: "korallen-tropfenohrringe" },
];
const matchOf = (productId: string, productSlugs: SlugMatch["productSlugs"], locale: string): SlugMatch => ({
  productId,
  locale,
  slug: productSlugs.find((t) => t.locale === locale)!.slug,
  productSlugs,
});

describe("productSlugFor", () => {
  it("takes the locale's slug, else the fallback (en) slug", () => {
    expect(productSlugFor(earrings, "de")).toBe("korallen-tropfenohrringe");
    expect(productSlugFor(earrings, "fr")).toBe("coral-drop-earrings");
  });

  it("is null for a product with neither", () => {
    expect(productSlugFor([{ locale: "uk", slug: "x" }], "fr")).toBeNull();
  });
});

describe("resolveProductPath", () => {
  it("accepts the locale's own slug", () => {
    expect(resolveProductPath([matchOf("p1", earrings, "de")], "de", "korallen-tropfenohrringe")).toEqual({
      kind: "ok",
      productId: "p1",
    });
  });

  it("accepts the fallback slug in a locale without a translation", () => {
    expect(resolveProductPath([matchOf("p1", earrings, "en")], "fr", "coral-drop-earrings")).toEqual({
      kind: "ok",
      productId: "p1",
    });
  });

  it("redirects the fallback slug or another locale's slug to the locale's slug", () => {
    expect(resolveProductPath([matchOf("p1", earrings, "en")], "de", "coral-drop-earrings")).toEqual({
      kind: "redirect",
      productId: "p1",
      slug: "korallen-tropfenohrringe",
    });
    expect(resolveProductPath([matchOf("p1", earrings, "uk")], "fr", "serezhky-krapli-z-koralom")).toEqual({
      kind: "redirect",
      productId: "p1",
      slug: "coral-drop-earrings",
    });
  });

  it("prefers the product whose slug is in the locale when two products share a slug", () => {
    const other = [
      { locale: "en", slug: "ring" },
      { locale: "nl", slug: "ring" },
    ];
    const enRing = [
      { locale: "en", slug: "ring-en" },
      { locale: "de", slug: "ring" },
    ];
    const matches = [matchOf("p2", enRing, "de"), matchOf("p3", other, "nl"), matchOf("p3", other, "en")];
    expect(resolveProductPath(matches, "nl", "ring")).toEqual({ kind: "ok", productId: "p3" });
    expect(resolveProductPath(matches, "de", "ring")).toEqual({ kind: "ok", productId: "p2" });
  });

  it("is notFound without a match, for a malformed slug, or for a product it cannot show in the locale", () => {
    expect(resolveProductPath([], "en", "coral-drop-earrings")).toEqual({ kind: "notFound" });
    expect(resolveProductPath([matchOf("p1", earrings, "en")], "en", "Coral_Drop")).toEqual({ kind: "notFound" });
    const ukOnly = [{ locale: "uk", slug: "lyshe-ukrainskoiu" }];
    expect(resolveProductPath([matchOf("p4", ukOnly, "uk")], "fr", "lyshe-ukrainskoiu")).toEqual({ kind: "notFound" });
  });
});
