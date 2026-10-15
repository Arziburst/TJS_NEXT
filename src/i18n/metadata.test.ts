import { describe, expect, it } from "vitest";
import { getAlternates } from "./metadata";
import { locales } from "./routing";

describe("getAlternates", () => {
  it("returns the canonical and 11 locales + x-default for the home page", () => {
    const alternates = getAlternates("/", "de");

    expect(alternates.canonical).toBe("/de");
    expect(alternates.languages).toEqual({
      uk: "/uk",
      en: "/en",
      de: "/de",
      fr: "/fr",
      es: "/es",
      it: "/it",
      pl: "/pl",
      nl: "/nl",
      cs: "/cs",
      pt: "/pt",
      ro: "/ro",
      "x-default": "/en",
    });
  });

  it("prefixes any path for every locale and points x-default at /en", () => {
    const alternates = getAlternates("/shop/rings", "uk");
    const languages = alternates.languages as Record<string, string>;

    expect(alternates.canonical).toBe("/uk/shop/rings");
    expect(Object.keys(languages)).toHaveLength(12);
    for (const locale of locales) expect(languages[locale]).toBe(`/${locale}/shop/rings`);
    expect(languages["x-default"]).toBe("/en/shop/rings");
  });
});
