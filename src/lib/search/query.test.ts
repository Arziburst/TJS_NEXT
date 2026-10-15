import { describe, expect, it } from "vitest";
import { highlightSegments, MAX_QUERY_LENGTH, MAX_TERM_LENGTH, MAX_TERMS, normalizeQuery, searchTerms } from "./query";

describe("normalizeQuery", () => {
  it("trims, collapses whitespace and cuts long input", () => {
    expect(normalizeQuery("  coral \n\t earrings  ")).toBe("coral earrings");
    expect(normalizeQuery(undefined)).toBe("");
    expect(normalizeQuery("a".repeat(500))).toHaveLength(MAX_QUERY_LENGTH);
  });

  it("applies NFKC (full-width letters and ligatures become plain ones)", () => {
    expect(normalizeQuery("ｃｏｒａｌ")).toBe("coral");
    expect(normalizeQuery("ﬁne")).toBe("fine");
  });
});

describe("searchTerms", () => {
  it("splits into lowercase words of any script", () => {
    expect(searchTerms("Сережки з КОРАЛОМ")).toEqual(["сережки", "з", "коралом"]);
    expect(searchTerms("Boucles d'oreilles")).toEqual(["boucles", "d", "oreilles"]);
    expect(searchTerms("Ohrringe größe 2")).toEqual(["ohrringe", "größe", "2"]);
  });

  it("drops every character of SQL, PostgREST or tsquery syntax: only letters and digits reach the database", () => {
    const hostile = [
      "'; drop table products; --",
      "coral' or '1'='1",
      "a & b | !c <-> d:* (e)",
      "%_\\",
      'coral") or ("1"="1',
      "name=eq.x&select=*",
      "$$; select 1; $$",
    ];
    for (const input of hostile) {
      for (const term of searchTerms(input)) expect(term, input).toMatch(/^[\p{L}\p{N}]+$/u);
    }
    expect(searchTerms("'; drop table products; --")).toEqual(["drop", "table", "products"]);
    expect(searchTerms("coral:* & !pearl")).toEqual(["coral", "pearl"]);
  });

  it("keeps each word once, at most MAX_TERMS words of at most MAX_TERM_LENGTH characters", () => {
    expect(searchTerms("coral Coral CORAL")).toEqual(["coral"]);
    expect(searchTerms("a b c d e f g h i j")).toHaveLength(MAX_TERMS);
    const [long] = searchTerms("x".repeat(90));
    expect(long).toHaveLength(MAX_TERM_LENGTH);
  });

  it("is empty when nothing is searchable", () => {
    expect(searchTerms("")).toEqual([]);
    expect(searchTerms("  -- ''' ?! ")).toEqual([]);
  });
});

describe("highlightSegments", () => {
  const marked = (title: string, terms: string[]) =>
    highlightSegments(title, terms)
      .filter((s) => s.match)
      .map((s) => s.text);

  it("marks the start of every word that begins with a term", () => {
    expect(marked("Сережки-краплі з коралом", ["корал"])).toEqual(["корал"]);
    expect(marked("Coral drop earrings", ["earr", "coral"])).toEqual(["Coral", "earr"]);
    expect(marked("Red coral necklace", ["co"])).toEqual(["co"]);
  });

  it("ignores case and diacritics", () => {
    expect(marked("Collier chaîne multirang", ["chaine"])).toEqual(["chaîne"]);
    expect(marked("ÉTÉ", ["ete"])).toEqual(["ÉTÉ"]);
  });

  it("marks only word starts, never the middle of a word", () => {
    expect(marked("Pearl stud earrings", ["ring"])).toEqual([]);
  });

  it("joins back to the title exactly", () => {
    for (const [title, terms] of [
      ["Сережки-краплі з коралом", ["корал", "сер"]],
      ["Gold-tone hoop earrings", ["gold", "hoop", "x"]],
      ["Ohrringe — größe 2", ["grö", "2"]],
      ["", ["a"]],
    ] as const) {
      expect(highlightSegments(title, [...terms]).map((s) => s.text).join("")).toBe(title);
    }
  });

  it("returns the title as one plain segment without terms", () => {
    expect(highlightSegments("Beaded bracelet", [])).toEqual([{ text: "Beaded bracelet", match: false }]);
  });
});
