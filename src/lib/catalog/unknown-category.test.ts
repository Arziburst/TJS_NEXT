import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { rewriteUnknownCategory } from "./unknown-category";

function rewriteOf(path: string): string | null {
  const response = rewriteUnknownCategory(new NextRequest(`http://localhost${path}`));
  const target = response?.headers.get("x-middleware-rewrite");
  return target ? new URL(target).pathname : null;
}

describe("rewriteUnknownCategory", () => {
  it("sends an unknown category slug to a path no route matches, keeping the locale", () => {
    expect(rewriteOf("/de/shop/unknown")).toBe("/de/shop/unknown/not-found");
    expect(rewriteOf("/uk/shop/Rings/")).toBe("/uk/shop/Rings/not-found");
    const response = rewriteUnknownCategory(new NextRequest("http://localhost/fr/shop/see-all"));
    expect(response?.headers.get("x-middleware-request-x-next-intl-locale")).toBe("fr");
  });

  it("leaves every other URL to the i18n proxy", () => {
    for (const path of ["/de/shop/rings", "/de/shop", "/de", "/xx/shop/foo", "/shop/foo", "/de/shop/rings/extra", "/de/product/x"]) {
      expect(rewriteUnknownCategory(new NextRequest(`http://localhost${path}`)), path).toBeNull();
    }
  });
});
