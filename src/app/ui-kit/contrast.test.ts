import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

const BEIGE = "#f4f0eb";
const BROWN = "#635a59";
const CORAL = "#ff614a";

describe("contrastRatio", () => {
  it("matches the WCAG reference pair black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio(BROWN, BEIGE)).toBeCloseTo(contrastRatio(BEIGE, BROWN), 10);
  });

  it("brown text on the beige background meets WCAG AA for normal text (4.5:1)", () => {
    expect(contrastRatio(BROWN, BEIGE)).toBeGreaterThanOrEqual(4.5);
  });

  it("beige text on the brown contained button meets WCAG AA", () => {
    expect(contrastRatio(BEIGE, BROWN)).toBeGreaterThanOrEqual(4.5);
  });

  it("the brown focus ring meets the 3:1 non-text contrast on beige", () => {
    expect(contrastRatio(BROWN, BEIGE)).toBeGreaterThanOrEqual(3);
  });

  it("documents that coral text on beige is below AA (legacy accent, raised to the owner)", () => {
    expect(contrastRatio(CORAL, BEIGE)).toBeLessThan(3);
  });
});
