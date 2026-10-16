import { describe, expect, it } from "vitest";
import { hasOrderFilters, ORDER_SEARCH_MAX_LENGTH, orderFilterParams, parseOrderFilters } from "./order-filters";

describe("the order list's filters in the URL", () => {
  it("reads every filter and the page", () => {
    expect(
      parseOrderFilters({ status: "new", from: "2026-10-01", to: "2026-10-16", country: "DE", q: " Olena ", page: "3" }),
    ).toEqual({
      filters: { status: "new", dateFrom: "2026-10-01", dateTo: "2026-10-16", country: "DE", query: "Olena" },
      page: 3,
    });
  });

  it("leaves out what does not parse", () => {
    expect(
      parseOrderFilters({ status: "paid", from: "2026-13-01", to: "yesterday", country: "GB", q: "  ", page: "-2" }),
    ).toEqual({ filters: {}, page: 1 });
    expect(parseOrderFilters({ status: ["new", "closed"], page: "1.5" })).toEqual({ filters: {}, page: 1 });
  });

  it("keeps Ukraine, the EU and Switzerland as countries (D2)", () => {
    expect(parseOrderFilters({ country: "UA" }).filters.country).toBe("UA");
    expect(parseOrderFilters({ country: "CH" }).filters.country).toBe("CH");
    expect(parseOrderFilters({ country: "US" }).filters.country).toBeUndefined();
  });

  it("cuts a long search", () => {
    expect(parseOrderFilters({ q: "x".repeat(300) }).filters.query).toHaveLength(ORDER_SEARCH_MAX_LENGTH);
  });

  it("writes the filters back for the page links", () => {
    const { filters } = parseOrderFilters({ status: "accepted", q: "10001" });
    expect(hasOrderFilters(filters)).toBe(true);
    expect(hasOrderFilters({})).toBe(false);
    expect(orderFilterParams(filters, 2)).toEqual({
      status: "accepted",
      from: undefined,
      to: undefined,
      country: undefined,
      q: "10001",
      page: "2",
    });
    expect(orderFilterParams(filters).page).toBeUndefined();
  });
});
