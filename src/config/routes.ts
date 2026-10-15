/*
 * The shop's routes, locale-less (the next-intl Link adds the prefix). The shell links only to enabled
 * routes: a link to a page that does not exist yet would answer every prefetch with a 404. The task that
 * lands a page turns its route on here.
 */
export const routes = {
  home: { path: "/", enabled: true },
  // #15
  shop: { path: "/shop", enabled: true },
  // #16: product cards link here (/product/<slug>), without prefetching while it is off
  product: { path: "/product", enabled: false },
  // #21
  aboutUs: { path: "/about-us", enabled: false },
  // #20
  cart: { path: "/cart", enabled: false },
  // #13
  signIn: { path: "/sign-in-and-up", enabled: true },
} as const satisfies Record<string, { path: string; enabled: boolean }>;

export type RouteKey = keyof typeof routes;

export function isRouteEnabled(key: RouteKey): boolean {
  return routes[key].enabled;
}
