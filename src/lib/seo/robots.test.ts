import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/routing";
import { buildRobots } from "./robots";

describe("buildRobots", () => {
  const robots = buildRobots(new URL("https://tjs.example"));
  const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;

  it("opens the storefront to every crawler and points to the sitemap", () => {
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toBe("/");
    expect(robots.sitemap).toBe("https://tjs.example/sitemap.xml");
  });

  it("closes the API and, in every locale, the admin, account, cart, checkout and demo pages", () => {
    const disallow = rule.disallow as string[];
    expect(disallow).toContain("/api/");
    for (const locale of locales) {
      for (const path of ["admin", "account", "cart", "checkout", "delivery-demo", "ui-kit"]) {
        expect(disallow).toContain(`/${locale}/${path}`);
      }
    }
    expect(disallow).toHaveLength(1 + 6 * locales.length);
  });

  it("keeps the storefront crawlable: no rule matches a shop, category, product or search URL", () => {
    const blocked = (path: string) => (rule.disallow as string[]).some((prefix) => path.startsWith(prefix));
    for (const path of ["/en", "/uk/shop", "/de/shop/earrings", "/en/product/cart-shaped-brooch", "/en/search?q=coral"]) {
      expect(blocked(path), path).toBe(false);
    }
  });
});
