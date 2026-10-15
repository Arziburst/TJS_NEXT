import { describe, expect, it } from "vitest";
import { isCategorySlug, isNewProduct, NEW_BADGE_DAYS } from "./categories";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-10-15T12:00:00Z");

describe("isNewProduct (D9: 7 days after creation)", () => {
  it("is new until 7 days have passed", () => {
    expect(NEW_BADGE_DAYS).toBe(7);
    expect(isNewProduct(new Date(now).toISOString(), now)).toBe(true);
    expect(isNewProduct(new Date(now - 7 * DAY + 1).toISOString(), now)).toBe(true);
    expect(isNewProduct(new Date(now - 7 * DAY).toISOString(), now)).toBe(false);
    expect(isNewProduct(new Date(now - 12 * DAY).toISOString(), now)).toBe(false);
  });

  it("reads Postgres timestamps and rejects garbage", () => {
    expect(isNewProduct("2026-10-14 08:30:00.123+00", now)).toBe(true);
    expect(isNewProduct("not a date", now)).toBe(false);
  });
});

describe("isCategorySlug", () => {
  it("accepts the six slugs of D9 only", () => {
    expect(["earrings", "necklaces", "bracelets", "corals", "rings", "brooches"].every(isCategorySlug)).toBe(true);
    expect(["see-all", "necklace", "brooch", "Rings", ""].some(isCategorySlug)).toBe(false);
  });
});
