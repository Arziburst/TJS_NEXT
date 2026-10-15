import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  firstPage,
  listingQuery,
  MAX_FILTER_VALUES,
  MAX_PAGES_SHOWN,
  NO_FILTERS,
  pagerItems,
  parseListingState,
  parseShopFilters,
  parseShopQuery,
  toQuery,
  totalPagesFor,
  type ListingState,
} from "./shop-query";

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

describe("the search context", () => {
  it("orders by relevance by default and offers newest first explicitly", () => {
    expect(parseShopQuery({}, "search").sort).toBe("relevance");
    expect(parseShopQuery({ sort: "newest" }, "search").sort).toBe("newest");
    expect(toQuery({ sort: "relevance", from: 1, page: 1 }, "search")).toEqual({});
    expect(toQuery({ sort: "newest", from: 1, page: 1 }, "search")).toEqual({ sort: "newest" });
  });

  it("has no relevance order in the shop", () => {
    expect(parseShopQuery({ sort: "relevance" }).sort).toBe("newest");
  });
});

describe("parseShopFilters", () => {
  it("reads lists given as one comma list or repeated, sorted and once each", () => {
    expect(parseShopFilters({ material: "glass,brass", colour: ["red", "gold-tone", "red"] })).toMatchObject({
      materials: ["brass", "glass"],
      colours: ["gold-tone", "red"],
    });
    expect(parseShopFilters({ material: ["brass", "glass,brass"] }).materials).toEqual(["brass", "glass"]);
  });

  it("drops values that are not slugs instead of failing", () => {
    expect(parseShopFilters({ material: "Brass,../x,a b,'; drop,ok-1,-x" }).materials).toEqual(["ok-1"]);
    expect(parseShopFilters({ material: "a".repeat(81) }).materials).toEqual([]);
    const many = Array.from({ length: 50 }, (_, i) => `m${i}`).join(",");
    expect(parseShopFilters({ material: many }).materials).toHaveLength(MAX_FILTER_VALUES);
  });

  it("reads the availability in its fixed order", () => {
    expect(parseShopFilters({ availability: "made-to-order,in-stock,sold" }).availability).toEqual(["in_stock", "made_to_order"]);
  });

  it("reads a price range with its currency; the currency alone means nothing", () => {
    expect(parseShopFilters({ min: "500", max: "1500,5", cur: "uah" }).price).toEqual({ min: "500", max: "1500.5", currency: "UAH" });
    expect(parseShopFilters({ min: "-1", max: "1e3", cur: "UAH" }).price).toEqual({ min: null, max: null, currency: null });
    expect(parseShopFilters({ max: "30", cur: "GBP" }).price).toEqual({ min: null, max: "30", currency: null });
  });
});

describe("listingQuery", () => {
  const state = (overrides: Partial<ListingState> = {}): ListingState => ({
    context: "shop",
    q: "",
    query: { sort: "newest", from: 1, page: 1 },
    filters: NO_FILTERS,
    ...overrides,
  });

  it("leaves everything out for the plain listing", () => {
    expect(listingQuery(state())).toEqual({});
  });

  it("writes the query, the filters, then sort and pages, so one view has one URL", () => {
    const query = listingQuery(
      state({
        context: "search",
        q: "coral",
        query: { sort: "price_asc", from: 1, page: 2 },
        filters: {
          materials: ["glass", "brass"],
          colours: ["red"],
          availability: ["made_to_order", "in_stock"],
          price: { min: "10", max: null, currency: "EUR" },
        },
      }),
    );
    expect(Object.entries(query)).toEqual([
      ["q", "coral"],
      ["material", "brass,glass"],
      ["colour", "red"],
      ["min", "10"],
      ["cur", "EUR"],
      ["availability", "in-stock,made-to-order"],
      ["sort", "price-asc"],
      ["page", "2"],
      ["from", "1"],
    ]);
  });

  it("round-trips through parseListingState", () => {
    const params = { q: "coral  drop", material: "brass", min: "10", max: "20", cur: "EUR", availability: "in-stock", sort: "newest", page: "2" };
    const parsed = parseListingState(params, "search");
    expect(parseListingState(listingQuery(parsed), "search")).toEqual(parsed);
    expect(parsed.q).toBe("coral drop");
    expect(parseListingState({ q: "coral" }, "shop").q).toBe("");
  });

  it("starts again at page 1 when a filter changes", () => {
    const changed = firstPage(state({ query: { sort: "price_desc", from: 2, page: 3 } }), {
      filters: { ...NO_FILTERS, colours: ["red"] },
    });
    expect(listingQuery(changed)).toEqual({ colour: "red", sort: "price-desc" });
  });

  it("counts the filters set, a price range once", () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(
      activeFilterCount({ materials: ["a", "b"], colours: ["c"], availability: ["in_stock"], price: { min: "1", max: "2", currency: null } }),
    ).toBe(5);
  });
});
