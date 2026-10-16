import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/routing";
import { buildPrompt, translateContent, type TranslationContent } from "./core";
import { GLOSSARY, GLOSSARY_RULES } from "./glossary";
import { partsOf, planNeeds, type TranslationHoldings } from "./plan";

const OTHERS = locales.filter((l) => l !== "uk");

// a product translated into every locale: its texts, its photo's alt, two sizes named in every locale
const translated: TranslationHoldings = {
  texts: [...locales],
  images: [{ id: "img-a", locales: [...locales] }],
  variants: [
    { id: "size-16", locales: [...locales] },
    { id: "size-17", locales: [...locales] },
  ],
};

const source: TranslationContent = {
  texts: {
    title: "Каблучка з бурштином",
    description: "Тонка каблучка.",
    materials: null,
    care: null,
    clasp: null,
    leadTimeNote: null,
    metaTitle: null,
    metaDescription: null,
    altText: null,
  },
  imageAlts: [{ imageId: "img-a", alt: "Каблучка на долоні" }],
  variantLabels: [
    { variantId: "size-16", label: "16" },
    { variantId: "size-17", label: "17" },
    { variantId: "size-18", label: "18 мм" },
  ],
};

describe("planNeeds (#102)", () => {
  it("plans only a new size's name, in every other locale, for a translated product", () => {
    const withNewSize = { ...translated, variants: [...translated.variants, { id: "size-18", locales: ["uk"] }] };
    const needs = planNeeds({ holdings: withNewSize, sourceLocale: "uk", candidates: locales, overwrite: false });
    expect(Object.keys(needs)).toEqual(OTHERS);
    for (const locale of OTHERS) expect(needs[locale]).toEqual({ texts: false, imageIds: [], variantIds: ["size-18"] });
  });

  it("plans nothing when every locale has every item", () => {
    expect(planNeeds({ holdings: translated, sourceLocale: "uk", candidates: locales, overwrite: false })).toEqual({});
  });

  it("plans per locale: a missing locale gets everything, a translated one only what it lacks", () => {
    const holdings: TranslationHoldings = {
      texts: ["uk", "en"],
      images: [{ id: "img-a", locales: ["uk", "en"] }],
      variants: [
        { id: "size-16", locales: ["uk", "en"] },
        { id: "size-18", locales: ["uk", "de"] },
      ],
    };
    const needs = planNeeds({ holdings, sourceLocale: "uk", candidates: ["en", "de"], overwrite: false });
    expect(needs).toEqual({
      en: { texts: false, imageIds: [], variantIds: ["size-18"] },
      // de has no product text yet; its size-18 name stays
      de: { texts: true, imageIds: ["img-a"], variantIds: ["size-16"] },
    });
  });

  it("with overwrite plans everything the source has, in the requested locales only", () => {
    const needs = planNeeds({ holdings: translated, sourceLocale: "uk", candidates: ["de", "uk"], overwrite: true });
    expect(needs).toEqual({ de: { texts: true, imageIds: ["img-a"], variantIds: ["size-16", "size-17"] } });
  });

  it("never translates what the source lacks, and nothing without a source text", () => {
    const holdings: TranslationHoldings = {
      texts: ["uk", "en"],
      images: [],
      variants: [{ id: "size-en-only", locales: ["en"] }],
    };
    expect(planNeeds({ holdings, sourceLocale: "uk", candidates: ["en"], overwrite: false })).toEqual({});
    expect(planNeeds({ holdings, sourceLocale: "de", candidates: ["en"], overwrite: true })).toEqual({});
  });
});

describe("partsOf (#102)", () => {
  it("cuts the call's content to what some target needs and gives each target only its items", () => {
    const { content, parts } = partsOf(source, {
      en: { texts: false, imageIds: [], variantIds: ["size-18"] },
      de: { texts: true, imageIds: ["img-a"], variantIds: ["size-16", "size-18"] },
    });
    expect(content.texts.title).toBe("Каблучка з бурштином");
    expect(content.variantLabels?.map((s) => s.variantId)).toEqual(["size-16", "size-18"]);
    expect(parts.en).toEqual({
      texts: Object.fromEntries(Object.keys(source.texts).map((f) => [f, null])),
      imageAlts: [],
      variantLabels: [{ variantId: "size-18", label: "18 мм" }],
    });
    expect(parts.de?.texts).toEqual(source.texts);
    expect(parts.de?.imageAlts).toEqual(source.imageAlts);
  });

  it("sends the model only the new size when that is all any locale lacks", () => {
    const needs = Object.fromEntries(OTHERS.map((l) => [l, { texts: false, imageIds: [], variantIds: ["size-18"] }]));
    const { content, parts } = partsOf(source, needs);
    const { prompt } = buildPrompt({ sourceLocale: "uk", targets: OTHERS, content, parts, glossary: GLOSSARY, rules: GLOSSARY_RULES });
    expect(prompt).toContain('"size1": "18 мм"');
    expect(prompt).not.toContain("Каблучка");
    // every target asks the same: no per-locale list
    expect(prompt).not.toContain("Translate only these keys");
  });
});

describe("translateContent with parts (#102)", () => {
  it("asks each locale only for its part and returns only that", async () => {
    const { content, parts } = partsOf(source, {
      en: { texts: false, imageIds: [], variantIds: ["size-18"] },
      de: { texts: true, imageIds: ["img-a"], variantIds: ["size-16", "size-18"] },
    });
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              translations: {
                en: { sizes: { size2: "18 mm" } },
                de: {
                  title: "Bernsteinring",
                  description: "Ein feiner Ring.",
                  imageAlts: { image1: "Ring auf der Hand" },
                  sizes: { size1: "16", size2: "18 mm" },
                },
              },
            }),
          },
        ],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        warnings: [],
      }),
    });
    const result = await translateContent({
      model,
      sourceLocale: "uk",
      targets: ["en", "de"],
      content,
      parts,
      glossary: GLOSSARY,
      rules: GLOSSARY_RULES,
    });

    const call = model.doGenerateCalls[0];
    const prompt = JSON.stringify(call.prompt);
    expect(prompt).toContain("Translate only these keys into each target locale");
    expect(prompt).toContain("en: sizes.size2");
    expect(prompt).toContain("de: title, description, imageAlts.image1, sizes.size1, sizes.size2");
    // the schema asks en for its one size name only
    expect(call.responseFormat).toMatchObject({
      schema: { properties: { translations: { properties: { en: { required: ["sizes"] } } } } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.failed).toEqual([]);
    expect(result.translations.en).toEqual({
      texts: Object.fromEntries(Object.keys(source.texts).map((f) => [f, null])),
      imageAlts: [],
      variantLabels: [{ variantId: "size-18", label: "18 mm" }],
    });
    expect(result.translations.de?.texts.title).toBe("Bernsteinring");
    expect(result.translations.de?.variantLabels).toEqual([
      { variantId: "size-16", label: "16" },
      { variantId: "size-18", label: "18 mm" },
    ]);
  });
});
