import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

const BEIGE = "#f4f0eb";
const BROWN = "#635a59";
const CORAL = "#ff614a";

// The tokens as the shop ships them, read from the stylesheet so the shipped value is tested, not a copy
const css = readFileSync("src/app/globals.css", "utf8");

function token(name: string): string {
  const match = new RegExp(`^\\s*--${name}:\\s*([^;]+);`, "m").exec(css);
  if (!match) throw new Error(`token --${name} not found in globals.css`);
  return match[1].trim();
}

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
});

describe("coral as text (D26)", () => {
  it("fills keep #ff614a, which is below AA as text", () => {
    expect(token("color-tjs-beige")).toBe(BEIGE);
    expect(token("color-tjs-coral")).toBe(CORAL);
    expect(token("accent")).toBe("var(--color-tjs-coral)");
    expect(contrastRatio(CORAL, BEIGE)).toBeLessThan(3);
  });

  it("text-accent-text resolves to the darker coral", () => {
    expect(token("color-accent-text")).toBe("var(--accent-text)");
    expect(token("accent-text")).toBe("var(--color-tjs-coral-text)");
  });

  // every surface coral text sits on: the page, cards and popovers (select menus) are all beige
  it.each(["background", "card", "popover"])("coral text on --%s meets WCAG AA (4.5:1)", (surface) => {
    expect(token(surface)).toBe("var(--color-tjs-beige)");
    const ratio = contrastRatio(token("color-tjs-coral-text"), BEIGE);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeCloseTo(4.98, 2);
  });
});
