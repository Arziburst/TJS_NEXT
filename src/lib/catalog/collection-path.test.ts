import { describe, expect, it } from "vitest";
import { collectionSlugFor, pickCollectionTranslation, resolveCollectionPath, type CollectionSlugMatch } from "./collection-path";

const spring = [
  { locale: "uk", slug: "vesna" },
  { locale: "en", slug: "spring" },
  { locale: "de", slug: "fruehling" },
];
const match = (slug: string, slugs = spring): CollectionSlugMatch => ({
  collectionId: "c1",
  locale: slugs.find((s) => s.slug === slug)?.locale ?? "uk",
  slug,
  collectionSlugs: slugs,
});

describe("a collection's URL", () => {
  it("falls back from the locale to en, then uk", () => {
    expect(collectionSlugFor(spring, "de")).toBe("fruehling");
    expect(collectionSlugFor(spring, "pl")).toBe("spring");
    expect(collectionSlugFor([{ locale: "uk", slug: "vesna" }], "pl")).toBe("vesna");
    expect(pickCollectionTranslation([{ locale: "fr", slug: "x" }], "pl")).toBeNull();
  });

  it("is canonical in its locale, and redirects there from another locale's slug", () => {
    expect(resolveCollectionPath([match("fruehling")], "de", "fruehling")).toEqual({ kind: "ok", collectionId: "c1" });
    expect(resolveCollectionPath([match("spring")], "de", "spring")).toEqual({ kind: "redirect", collectionId: "c1", slug: "fruehling" });
    expect(resolveCollectionPath([match("vesna")], "pl", "vesna")).toEqual({ kind: "redirect", collectionId: "c1", slug: "spring" });
    // only Ukrainian: the uk slug serves every locale
    const ukOnly = [{ locale: "uk", slug: "vesna" }];
    expect(resolveCollectionPath([match("vesna", ukOnly)], "fr", "vesna")).toEqual({ kind: "ok", collectionId: "c1" });
  });

  it("is not found for an unknown or malformed slug", () => {
    expect(resolveCollectionPath([], "en", "spring")).toEqual({ kind: "notFound" });
    expect(resolveCollectionPath([match("spring")], "en", "Spring!")).toEqual({ kind: "notFound" });
  });
});
