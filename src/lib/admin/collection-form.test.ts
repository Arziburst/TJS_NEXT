import { describe, expect, it } from "vitest";
import { collectionFormInput, parseCollectionForm } from "./collection-form";

const input = (translations: Record<string, { name: string; slug?: string; description?: string }>) =>
  collectionFormInput.parse({
    id: null,
    published: false,
    position: 0,
    translations: Object.fromEntries(
      Object.entries(translations).map(([locale, t]) => [locale, { slug: "", description: "", ...t }]),
    ),
  });

describe("parseCollectionForm", () => {
  it("stores the named locales in the editor's order, a slug made from the name when none is typed", () => {
    expect(parseCollectionForm(input({ en: { name: "Spring", slug: "spring-26" }, uk: { name: "Весна", description: " Легкі " } }))).toEqual({
      ok: true,
      translations: [
        { locale: "uk", slug: "vesna", name: "Весна", description: "Легкі" },
        { locale: "en", slug: "spring-26", name: "Spring", description: null },
      ],
    });
  });

  it("requires the uk name, and a name wherever a slug or description was typed", () => {
    expect(parseCollectionForm(input({ en: { name: "Spring" } }))).toEqual({ ok: false, fields: { "uk.name": "required" } });
    expect(parseCollectionForm(input({ uk: { name: "Весна" }, de: { name: "", description: "Frühling" } }))).toEqual({
      ok: false,
      fields: { "de.name": "required" },
    });
  });

  it("refuses a malformed slug", () => {
    expect(parseCollectionForm(input({ uk: { name: "Весна", slug: "Весна!" } }))).toEqual({ ok: false, fields: { "uk.slug": "invalidSlug" } });
    expect(parseCollectionForm(input({ uk: { name: "!!!" } }))).toEqual({ ok: false, fields: { "uk.slug": "invalidSlug" } });
  });
});
