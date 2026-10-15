import { describe, expect, it } from "vitest";
import { MAX_PAGES_SHOWN, pagerItems, parseShopQuery, toQuery, totalPagesFor } from "./shop-query";

describe("parseShopQuery", () => {
  it("defaults to newest first, page 1", () => {
    expect(parseShopQuery({})).toEqual({ sort: "newest", from: 1, page: 1 });
  });

  it("reads sort, page and the first page of a 'show more' range", () => {
    expect(parseShopQuery({ sort: "price-desc", page: "3", from: "2" })).toEqual({ sort: "price_desc", from: 2, page: 3 });
    expect(parseShopQuery({ sort: "price-asc", page: "4" })).toEqual({ sort: "price_asc", from: 4, page: 4 });
  });

  it("ignores malformed values instead of failing", () => {
    for (const sort of ["toString", "constructor", "price_asc", "", "PRICE-ASC"]) {
      expect(parseShopQuery({ sort }).sort, sort).toBe("newest");
    }
    for (const page of ["0", "-1", "1.5", "abc", "01", "9999999", ""]) {
      expect(parseShopQuery({ page }).page, page).toBe(1);
    }
    expect(parseShopQuery({ sort: ["price-desc", "price-asc"], page: ["2", "5"] })).toEqual({
      sort: "price_desc",
      from: 2,
      page: 2,
    });
  });

  it("keeps from within 1..page and at most MAX_PAGES_SHOWN pages", () => {
    expect(parseShopQuery({ page: "2", from: "5" })).toEqual({ sort: "newest", from: 2, page: 2 });
    expect(parseShopQuery({ page: "30", from: "1" }).from).toBe(30 - MAX_PAGES_SHOWN + 1);
  });
});

describe("toQuery", () => {
  it("leaves defaults out so every state has one URL", () => {
    expect(toQuery({ sort: "newest", from: 1, page: 1 })).toEqual({});
    expect(toQuery({ sort: "price_asc", from: 1, page: 2 })).toEqual({ sort: "price-asc", page: "2", from: "1" });
    expect(toQuery({ sort: "price_desc", from: 3, page: 3 })).toEqual({ sort: "price-desc", page: "3" });
  });

  it("round-trips through parseShopQuery", () => {
    const state = { sort: "price_desc" as const, from: 2, page: 4 };
    expect(parseShopQuery(toQuery(state))).toEqual(state);
  });
});

describe("pager", () => {
  it("counts pages of 20", () => {
    expect([0, 1, 20, 21, 31, 40, 41].map(totalPagesFor)).toEqual([1, 1, 1, 2, 2, 2, 3]);
  });

  it("shows the first and last page and two neighbours, with gaps", () => {
    expect(pagerItems(1, 1)).toEqual([1]);
    expect(pagerItems(1, 5)).toEqual([1, 2, 3, "gap", 5]);
    expect(pagerItems(5, 10)).toEqual([1, "gap", 3, 4, 5, 6, 7, "gap", 10]);
    expect(pagerItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pagerItems(10, 10)).toEqual([1, "gap", 8, 9, 10]);
  });
});
