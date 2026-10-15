import { describe, expect, it } from "vitest";
import {
  MAX_FAVORITES,
  RECENTLY_VIEWED_LIMIT,
  mergeFavorites,
  parseIdList,
  recordView,
  serializeIdList,
  setFavorite,
} from "./ids";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = (count: number, from = 1) => Array.from({ length: count }, (_, i) => id(from + i));

describe("parseIdList", () => {
  it("reads the ids a cookie holds, newest first", () => {
    expect(parseIdList(serializeIdList([id(3), id(1), id(2)], 12), 12)).toEqual([id(3), id(1), id(2)]);
  });

  it("treats a missing or broken cookie as an empty list", () => {
    expect(parseIdList(undefined, 12)).toEqual([]);
    expect(parseIdList("", 12)).toEqual([]);
    expect(parseIdList("not-a-list", 12)).toEqual([]);
    expect(parseIdList('["' + id(1) + '"]', 12)).toEqual([]);
  });

  it("drops anything that is not a product id and every duplicate", () => {
    expect(parseIdList([id(1), "x", id(1).toUpperCase(), "<script>", id(2)].join("."), 12)).toEqual([id(1), id(2)]);
  });

  it("keeps at most the limit", () => {
    expect(parseIdList(serializeIdList(ids(30), 30), 12)).toEqual(ids(12));
    expect(serializeIdList(ids(30), 12).split(".")).toHaveLength(12);
  });

  it("keeps a full list well below 4 KB", () => {
    expect(serializeIdList(ids(MAX_FAVORITES), MAX_FAVORITES).length).toBeLessThan(2000);
  });
});

describe("setFavorite", () => {
  it("puts a new favorite first", () => {
    expect(setFavorite([id(1)], id(2), true)).toEqual({ ok: true, ids: [id(2), id(1)] });
  });

  it("is idempotent both ways", () => {
    expect(setFavorite([id(2), id(1)], id(1), true)).toEqual({ ok: true, ids: [id(2), id(1)] });
    expect(setFavorite([id(1)], id(2), false)).toEqual({ ok: true, ids: [id(1)] });
  });

  it("removes a favorite", () => {
    expect(setFavorite([id(2), id(1)], id(2), false)).toEqual({ ok: true, ids: [id(1)] });
  });

  it("refuses a new favorite when the list is full, but still removes", () => {
    const full = ids(MAX_FAVORITES);
    expect(setFavorite(full, id(999), true)).toEqual({ ok: false, reason: "favoritesFull" });
    expect(setFavorite(full, id(1), true)).toEqual({ ok: true, ids: full });
    expect(setFavorite(full, id(1), false)).toEqual({ ok: true, ids: full.slice(1) });
  });
});

describe("mergeFavorites", () => {
  it("puts the guest's new favorites before the account's", () => {
    expect(mergeFavorites([id(1), id(2)], [id(3), id(2)])).toEqual([id(3), id(1), id(2)]);
  });

  it("is idempotent", () => {
    const once = mergeFavorites([id(1)], [id(2), id(3)]);
    expect(mergeFavorites(once, [id(2), id(3)])).toEqual(once);
  });

  it("never drops the account's own favorites, only guest ones past the bound", () => {
    const account = ids(MAX_FAVORITES - 1, 100);
    expect(mergeFavorites(account, [id(1), id(2)])).toEqual([id(1), ...account]);
    const over = ids(MAX_FAVORITES + 5, 100);
    expect(mergeFavorites(over, [id(1)])).toEqual(over);
  });
});

describe("recordView", () => {
  it("moves the viewed piece to the front", () => {
    expect(recordView([id(1), id(2), id(3)], id(3))).toEqual([id(3), id(1), id(2)]);
    expect(recordView([], id(1))).toEqual([id(1)]);
  });

  it("forgets the oldest beyond the limit", () => {
    const viewed = ids(RECENTLY_VIEWED_LIMIT);
    const next = recordView(viewed, id(999));
    expect(next).toHaveLength(RECENTLY_VIEWED_LIMIT);
    expect(next[0]).toBe(id(999));
    expect(next).not.toContain(viewed.at(-1));
  });
});
