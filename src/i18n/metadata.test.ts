import { afterEach, describe, expect, it, vi } from "vitest";
import { getAlternates, getMetadataBase } from "./metadata";
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

describe("getMetadataBase", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://tjstore.pp.ua");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "shop.example.com");
    expect(getMetadataBase().href).toBe("https://tjstore.pp.ua/");
  });

  it("uses the Vercel production domain without NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "shop.example.com");
    expect(getMetadataBase().href).toBe("https://shop.example.com/");
  });

  it("falls back to the local server", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("PORT", "3010");
    expect(getMetadataBase().href).toBe("http://localhost:3010/");
  });
});
