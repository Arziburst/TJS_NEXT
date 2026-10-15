import { describe, expect, it } from "vitest";
import { SLUG_MAX_LENGTH, SLUG_PATTERN, slugify } from "./slug";

describe("slugify", () => {
  it.each([
    // the seed's own slugs (KMU 2010)
    ["Сережки-краплі з коралом", "serezhky-krapli-z-koralom"],
    ["Багатошарове намисто-ланцюжок", "bahatosharove-namysto-lantsiuzhok"],
    ["Браслет з коралових намистин", "braslet-z-koralovykh-namystyn"],
    ["Регульована каблучка", "rehulovana-kabluchka"],
    ["Сталевий браслет-манжета", "stalevyi-braslet-manzheta"],
    // word-initial є ї й ю я, the apostrophe, зг
    ["Юлія Їжак Євген Яблуко", "yuliia-yizhak-yevhen-yabluko"],
    ["Об'ємна брошка", "obiemna-broshka"],
    ["Згадка", "zghadka"],
    // Latin locales
    ["Korallen-Tropfenohrringe Größe", "korallen-tropfenohrringe-grosse"],
    ["Boucles d'oreilles à fleur", "boucles-d-oreilles-a-fleur"],
    ["Bransoletka z zawieszkami — złota", "bransoletka-z-zawieszkami-zlota"],
    ["Náušnice s perlou", "nausnice-s-perlou"],
    ["Brățări", "bratari"],
    ["  ¡Collar!  ", "collar"],
  ])("%s -> %s", (title, slug) => {
    expect(slugify(title)).toBe(slug);
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it("is empty when nothing is usable", () => {
    expect(slugify("✨ — ✨")).toBe("");
  });

  it("cuts a long title at a word boundary", () => {
    const slug = slugify("Very long title ".repeat(20));
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug).toMatch(SLUG_PATTERN);
    expect(slug.endsWith("title") || slug.endsWith("long") || slug.endsWith("very")).toBe(true);
  });
});
