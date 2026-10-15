import { describe, expect, it } from "vitest";
import { EDITOR_LOCALES, parseProductForm } from "./product-form";

const CATEGORY = "c1000000-0000-4000-8000-000000000001";

function form(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    id: "",
    categoryId: CATEGORY,
    sku: "",
    status: "draft",
    fulfillment: "made_to_order",
    availability: "available",
    priceUsd: "29.90",
    weightG: "5",
    leadTimeMin: "",
    leadTimeMax: "",
    lengthMm: "",
    widthMm: "",
    heightMm: "",
    position: "",
    "tr.uk.title": "Сережки-краплі з коралом",
    ...overrides,
  };
}

describe("parseProductForm", () => {
  it("lists uk first, then en, then the other locales", () => {
    expect(EDITOR_LOCALES.slice(0, 2)).toEqual(["uk", "en"]);
    expect(EDITOR_LOCALES).toHaveLength(11);
  });

  it("parses a made-to-order product with a lead time range and generates the slug", () => {
    const result = parseProductForm(
      form({ leadTimeMin: "3", leadTimeMax: "8", lengthMm: "41,5", "tr.uk.leadTimeNote": " Довше в грудні ", sku: " A-1 " }),
    );
    expect(result).toEqual({
      ok: true,
      input: {
        id: null,
        product: {
          category_id: CATEGORY,
          sku: "A-1",
          status: "draft",
          fulfillment: "made_to_order",
          availability: "available",
          lead_time_min_days: 3,
          lead_time_max_days: 8,
          price_usd: "29.90",
          weight_g: "5",
          length_mm: "41.5",
          width_mm: null,
          height_mm: null,
          position: 0,
        },
        translations: [
          {
            locale: "uk",
            slug: "serezhky-krapli-z-koralom",
            title: "Сережки-краплі з коралом",
            description: null,
            materials: null,
            care: null,
            clasp: null,
            lead_time_note: "Довше в грудні",
            meta_title: null,
            meta_description: null,
          },
        ],
      },
    });
  });

  it("takes one lead time bound as a fixed time and refuses a reversed range", () => {
    const fixed = parseProductForm(form({ leadTimeMin: "5" }));
    expect(fixed.ok && [fixed.input.product.lead_time_min_days, fixed.input.product.lead_time_max_days]).toEqual([5, 5]);
    expect(parseProductForm(form({ leadTimeMin: "9", leadTimeMax: "3" }))).toEqual({
      ok: false,
      fields: { leadTimeMax: "leadTimeOrder" },
    });
    expect(parseProductForm(form({ leadTimeMin: "0" }))).toEqual({ ok: false, fields: { leadTimeMin: "outOfRange" } });
  });

  it("drops the lead time and its note of a one-of-a-kind piece and keeps its availability", () => {
    const result = parseProductForm(
      form({ fulfillment: "one_of_a_kind", availability: "sold", leadTimeMin: "3", "tr.uk.leadTimeNote": "x" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.product).toMatchObject({ availability: "sold", lead_time_min_days: null, lead_time_max_days: null });
    expect(result.input.translations[0].lead_time_note).toBeNull();
  });

  it("forces a made-to-order product available, with or without the field", () => {
    const result = parseProductForm(form({ availability: "sold" }));
    expect(result.ok && result.input.product.availability).toBe("available");
    const withoutField = form();
    delete withoutField.availability;
    const missing = parseProductForm(withoutField);
    expect(missing.ok && missing.input.product.availability).toBe("available");
  });

  it("needs the uk translation to publish", () => {
    expect(parseProductForm(form({ status: "published", "tr.uk.title": "", "tr.en.title": "Earrings" }))).toEqual({
      ok: false,
      fields: { "tr.uk.title": "requiredToPublish" },
    });
    expect(parseProductForm(form({ status: "published" })).ok).toBe(true);
  });

  it("reports field errors by field name", () => {
    const result = parseProductForm(
      form({
        categoryId: "",
        priceUsd: "0",
        weightG: "abc",
        widthMm: "-1",
        "tr.en.description": "text without a title",
        "tr.de.title": "Ohrringe",
        "tr.de.slug": "Not A Slug",
        "tr.fr.title": "x".repeat(201),
      }),
    );
    expect(result).toEqual({
      ok: false,
      fields: {
        categoryId: "required",
        priceUsd: "outOfRange",
        weightG: "invalidNumber",
        widthMm: "invalidNumber",
        "tr.en.title": "titleRequired",
        "tr.de.slug": "invalidSlug",
        "tr.fr.title": "tooLong",
      },
    });
  });

  it("refuses an unknown status or id", () => {
    const result = parseProductForm(form({ status: "deleted", id: "1" }));
    expect(result).toEqual({ ok: false, fields: { status: "required", id: "required" } });
  });
});
