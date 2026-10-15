import { expect, type Locator } from "@playwright/test";
import { routes, type RouteKey } from "../src/config/routes";

/**
 * The shell links every enabled route of `keys` (src/config/routes.ts) and no disabled one: a link to a
 * page that does not exist yet would answer its prefetch with a 404.
 */
export async function expectOnlyEnabledRouteLinks(scope: Locator, locale: string, keys: readonly RouteKey[]) {
  for (const key of keys) {
    const { path, enabled } = routes[key];
    const links = scope.locator(`a[href="/${locale}${path === "/" ? "" : path}"]`);
    if (enabled) {
      await expect(links.first(), `link to the enabled route "${key}"`).toBeAttached();
    } else {
      await expect(links, `link to the disabled route "${key}"`).toHaveCount(0);
    }
  }
}

// the routes the header links to; a product page is linked from product cards, not from the shell
export const shellRouteKeys: readonly RouteKey[] = ["home", "shop", "aboutUs", "favorites", "cart", "signIn"];
// the mobile menu repeats the logo, the nav and the account slot; the favorites and the cart stay in the header bar
export const mobileMenuRouteKeys: readonly RouteKey[] = ["home", "shop", "aboutUs", "signIn"];
