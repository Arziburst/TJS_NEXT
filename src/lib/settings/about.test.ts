import { describe, expect, it } from "vitest";
import { aboutView, indexedAboutLocales, type AboutContent, type AboutTranslation } from "./about";

function text(locale: AboutTranslation["locale"], extra: Partial<AboutTranslation> = {}): AboutTranslation {
  return { locale, bodyHtml: `<p>${locale}</p>`, metaDescription: null, source: "human", reviewedAt: null, ...extra };
}

describe("aboutView", () => {
  it("shows nothing while the page is unpublished", () => {
    expect(aboutView({ published: false, translations: [text("uk")] }, "uk")).toBeNull();
    expect(aboutView(null, "uk")).toBeNull();
  });

  it("shows a locale's own text, indexed", () => {
    const content: AboutContent = { published: true, translations: [text("uk"), text("en"), text("de")] };
    expect(aboutView(content, "de")).toEqual({ translation: text("de"), isFallback: false, indexable: true });
  });

  it("falls back to en, then uk, without indexing", () => {
    expect(aboutView({ published: true, translations: [text("uk"), text("en")] }, "fr")).toEqual({
      translation: text("en"),
      isFallback: true,
      indexable: false,
    });
    expect(aboutView({ published: true, translations: [text("uk")] }, "fr")).toEqual({
      translation: text("uk"),
      isFallback: true,
      indexable: false,
    });
  });

  it("does not index an unreviewed machine translation", () => {
    const content: AboutContent = { published: true, translations: [text("uk"), text("pl", { source: "machine" })] };
    expect(aboutView(content, "pl")?.indexable).toBe(false);
    const reviewed: AboutContent = {
      published: true,
      translations: [text("uk"), text("pl", { source: "machine", reviewedAt: "2026-10-16T00:00:00Z" })],
    };
    expect(aboutView(reviewed, "pl")?.indexable).toBe(true);
  });
});

describe("indexedAboutLocales", () => {
  it("lists the locales with their own reviewed text", () => {
    const content: AboutContent = {
      published: true,
      translations: [text("uk"), text("en"), text("pl", { source: "machine" })],
    };
    expect(indexedAboutLocales(content)).toEqual(["uk", "en"]);
    expect(indexedAboutLocales({ ...content, published: false })).toEqual([]);
  });
});
