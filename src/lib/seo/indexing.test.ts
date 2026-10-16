import { describe, expect, it } from "vitest";
import { isIndexable, translationRobots } from "./indexing";

describe("the indexing rule of product translations", () => {
  it("keeps an unreviewed machine translation out of search engines, but lets its links count", () => {
    expect(isIndexable({ source: "machine", reviewedAt: null })).toBe(false);
    expect(translationRobots({ source: "machine", reviewedAt: null })).toEqual({ index: false, follow: true });
  });

  it("indexes a reviewed machine translation", () => {
    const reviewed = { source: "machine", reviewedAt: "2026-10-16T10:00:00Z" } as const;
    expect(isIndexable(reviewed)).toBe(true);
    expect(translationRobots(reviewed)).toBeUndefined();
  });

  it("indexes a human translation, reviewed or not", () => {
    expect(isIndexable({ source: "human", reviewedAt: null })).toBe(true);
    expect(translationRobots({ source: "human", reviewedAt: null })).toBeUndefined();
  });
});
