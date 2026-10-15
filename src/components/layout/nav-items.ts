import { isRouteEnabled, routes, type RouteKey } from "@/config/routes";

// Locale-less paths; the next-intl Link adds the current locale prefix.
export type NavItem = { href: string; labelKey: "shop" | "aboutUs" };

// only the routes that exist (src/config/routes.ts); the others join the nav when their page lands
function navItems(items: readonly { route: RouteKey; labelKey: NavItem["labelKey"] }[]): readonly NavItem[] {
  return items
    .filter(({ route }) => isRouteEnabled(route))
    .map(({ route, labelKey }) => ({ href: routes[route].path, labelKey }));
}

export const NAV_LEFT = navItems([{ route: "shop", labelKey: "shop" }]);
export const NAV_RIGHT = navItems([{ route: "aboutUs", labelKey: "aboutUs" }]);
