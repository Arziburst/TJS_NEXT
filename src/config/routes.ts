/*
 * The shop's routes, locale-less (the next-intl Link adds the prefix). The shell links only to enabled
 * routes: a link to a page that does not exist yet would answer every prefetch with a 404. The task that
 * lands a page turns its route on here.
 */
export const routes = {
  home: { path: "/", enabled: true },
  // #15
  shop: { path: "/shop", enabled: true },
  // #25: /search?q=…; the header's search form submits here
  search: { path: "/search", enabled: true },
  // #16: /product/<slug>; product cards link here, the shell does not
  product: { path: "/product", enabled: true },
  // #21
  aboutUs: { path: "/about", enabled: true },
  // #20
  cart: { path: "/cart", enabled: true },
  // #29
  favorites: { path: "/favorites", enabled: true },
  // #24: the order request, the cart's next step
  orderRequest: { path: "/checkout", enabled: true },
  // #24: its confirmation (?order=<number>); the checkout opens it, the shell does not link it
  orderRequestDone: { path: "/checkout/done", enabled: true },
  // #13
  signIn: { path: "/sign-in-and-up", enabled: true },
  // #13: a signed-in user's new password; the account page links here
  updatePassword: { path: "/update-password", enabled: true },
  // #28: signed-in only (noindex); the account menu links here, the shell's guest slot does not
  account: { path: "/account", enabled: true },
  // #28: the order history; /account/orders/<number> is one order, linked from the history
  accountOrders: { path: "/account/orders", enabled: true },
  accountAddresses: { path: "/account/addresses", enabled: true },
  // #17: admins only (noindex); the account menu links here for an admin, the shell does not
  admin: { path: "/admin", enabled: true },
} as const satisfies Record<string, { path: string; enabled: boolean }>;

export type RouteKey = keyof typeof routes;

export function isRouteEnabled(key: RouteKey): boolean {
  return routes[key].enabled;
}
