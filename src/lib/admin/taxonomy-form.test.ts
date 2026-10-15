import { describe, expect, it } from "vitest";
import { baseSlugFor, freeSlug, parseTermForm, parseTermIds, TERM_NAME_MAX_LENGTH } from "./taxonomy-form";

const ID = "d2500000-0000-4000-8000-000000000001";

describe("parseTermForm", () => {
  it("keeps the names given, trimmed, and needs the Ukrainian one", () => {
    expect(parseTermForm({ id: "", kind: "material", "name.uk": "  Латунь ", "name.en": "Brass", "name.de": "  " })).toEqual({
      ok: true,
      input: { id: null, kind: "material", names: { uk: "Латунь", en: "Brass" } },
    });
    expect(parseTermForm({ id: ID, kind: "colour", "name.en": "Red" })).toEqual({ ok: false, fields: { "name.uk": "required" } });
  });

  it("refuses a name longer than the column allows", () => {
    const long = "x".repeat(TERM_NAME_MAX_LENGTH + 1);
    expect(parseTermForm({ id: "", kind: "material", "name.uk": "Латунь", "name.pl": long })).toEqual({
      ok: false,
      fields: { "name.pl": "tooLong" },
    });
  });

  it("refuses an unknown kind or a malformed id as an invalid request", () => {
    expect(parseTermForm({ id: "", kind: "size", "name.uk": "S" })).toMatchObject({ ok: false, invalid: true });
    expect(parseTermForm({ id: "1; drop", kind: "material", "name.uk": "S" })).toMatchObject({ ok: false, invalid: true });
  });
});

describe("the slug of a new term", () => {
  it("comes from the English name, else the Ukrainian one, else the kind", () => {
    expect(baseSlugFor({ id: null, kind: "material", names: { uk: "Латунь", en: "Brass" } })).toBe("brass");
    expect(baseSlugFor({ id: null, kind: "colour", names: { uk: "Золотистий" } })).toBe("zolotystyi");
    expect(baseSlugFor({ id: null, kind: "colour", names: { uk: "★" } })).toBe("colour");
  });

  it("gets a number when the list already has it", () => {
    expect(freeSlug("brass", new Set())).toBe("brass");
    expect(freeSlug("brass", new Set(["brass", "brass-2"]))).toBe("brass-3");
  });
});

describe("parseTermIds", () => {
  it("takes term ids once each and refuses anything else", () => {
    expect(parseTermIds([ID, ID])).toEqual([ID]);
    expect(parseTermIds([])).toEqual([]);
    expect(parseTermIds(["not-an-id"])).toBeNull();
    expect(parseTermIds([new File([], "x")])).toBeNull();
  });
});
