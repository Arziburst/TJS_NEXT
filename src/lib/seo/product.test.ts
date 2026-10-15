import { describe, expect, it } from "vitest";
import {
  productAlternates,
  productOpenGraphLocales,
  productJsonLd,
  schemaAvailability,
  serializeJsonLd,
  type ProductJsonLdInput,
} from "./product";

const translations = [
  { locale: "en", slug: "coral-drop-earrings" },
  { locale: "uk", slug: "serezhky-krapli-z-koralom" },
  { locale: "de", slug: "korallen-tropfenohrringe" },
];

describe("productAlternates", () => {
  it("lists hreflang only for translated locales, x-default on en, canonical on itself", () => {
    const alternates = productAlternates(translations, { locale: "de", slug: "korallen-tropfenohrringe" });
    expect(alternates.canonical).toBe("/de/product/korallen-tropfenohrringe");
    expect(alternates.languages).toEqual({
      uk: "/uk/product/serezhky-krapli-z-koralom",
      en: "/en/product/coral-drop-earrings",
      de: "/de/product/korallen-tropfenohrringe",
      "x-default": "/en/product/coral-drop-earrings",
    });
  });

  it("canonicalizes a page shown in the fallback locale to the en page", () => {
    const alternates = productAlternates(translations, { locale: "en", slug: "coral-drop-earrings" });
    expect(alternates.canonical).toBe("/en/product/coral-drop-earrings");
    expect(Object.keys(alternates.languages ?? {})).not.toContain("fr");
  });

  it("has no x-default without an en translation", () => {
    const alternates = productAlternates([{ locale: "uk", slug: "lyshe" }], { locale: "uk", slug: "lyshe" });
    expect(alternates.languages).toEqual({ uk: "/uk/product/lyshe" });
  });
});

describe("productOpenGraphLocales", () => {
  it("names the shown content's locale as language_TERRITORY and the other translations as alternates", () => {
    expect(productOpenGraphLocales(translations, "de")).toEqual({ locale: "de_DE", alternateLocale: ["uk_UA", "en_US"] });
    expect(productOpenGraphLocales(translations, "uk")).toEqual({ locale: "uk_UA", alternateLocale: ["en_US", "de_DE"] });
  });
});

describe("schemaAvailability", () => {
  it("maps fulfillment and availability to schema.org", () => {
    expect(schemaAvailability("made_to_order", "available")).toBe("https://schema.org/MadeToOrder");
    expect(schemaAvailability("one_of_a_kind", "available")).toBe("https://schema.org/InStock");
    expect(schemaAvailability("one_of_a_kind", "reserved")).toBe("https://schema.org/Reserved");
    expect(schemaAvailability("one_of_a_kind", "sold")).toBe("https://schema.org/SoldOut");
  });
});

const input: ProductJsonLdInput = {
  url: "https://tjs.test/de/product/korallen-tropfenohrringe",
  name: "Korallen-Tropfenohrringe",
  description: "Leichte Tropfenohrringe.",
  images: ["https://storage.test/1.png", "https://storage.test/2.png"],
  sku: "TEST-001",
  brand: "TJS",
  fulfillment: "one_of_a_kind",
  availability: "available",
  price: { price: "27.90", priceCurrency: "EUR" },
  breadcrumbs: [
    { name: "TJS", url: "https://tjs.test/de" },
    { name: "Ohrringe", url: "https://tjs.test/de/shop/earrings" },
    { name: "Korallen-Tropfenohrringe", url: "https://tjs.test/de/product/korallen-tropfenohrringe" },
  ],
};

describe("productJsonLd", () => {
  it("builds a Product with one Offer in the given currency and a BreadcrumbList", () => {
    expect(productJsonLd(input)).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Product",
          "@id": "https://tjs.test/de/product/korallen-tropfenohrringe#product",
          name: "Korallen-Tropfenohrringe",
          url: "https://tjs.test/de/product/korallen-tropfenohrringe",
          brand: { "@type": "Brand", name: "TJS" },
          description: "Leichte Tropfenohrringe.",
          image: ["https://storage.test/1.png", "https://storage.test/2.png"],
          sku: "TEST-001",
          offers: {
            "@type": "Offer",
            url: "https://tjs.test/de/product/korallen-tropfenohrringe",
            price: "27.90",
            priceCurrency: "EUR",
            availability: "https://schema.org/InStock",
            itemCondition: "https://schema.org/NewCondition",
          },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "TJS", item: "https://tjs.test/de" },
            { "@type": "ListItem", position: 2, name: "Ohrringe", item: "https://tjs.test/de/shop/earrings" },
            {
              "@type": "ListItem",
              position: 3,
              name: "Korallen-Tropfenohrringe",
              item: "https://tjs.test/de/product/korallen-tropfenohrringe",
            },
          ],
        },
      ],
    });
  });

  it("states no Offer without a price, and leaves out empty fields", () => {
    const [product] = productJsonLd({ ...input, price: null, description: null, images: [], sku: null })[
      "@graph"
    ] as Record<string, unknown>[];
    expect(product).not.toHaveProperty("offers");
    expect(product).not.toHaveProperty("description");
    expect(product).not.toHaveProperty("image");
    expect(product).not.toHaveProperty("sku");
  });
});

describe("serializeJsonLd", () => {
  it("escapes < so the data cannot close its script element", () => {
    const json = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
