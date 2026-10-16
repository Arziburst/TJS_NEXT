import type { Locale } from "./routing";

export const namespaces = [
  "common",
  "nav",
  "home",
  "catalog",
  "product",
  "cart",
  "checkout",
  "auth",
  "account",
  "admin",
  "errors",
  "notifications",
] as const;

export type Namespace = (typeof namespaces)[number];

// Each locale keeps one JSON file per namespace in messages/<locale>/<namespace>.json
export async function loadMessages(locale: Locale): Promise<Messages> {
  const entries = await Promise.all(
    namespaces.map(
      async (namespace) =>
        [namespace, (await import(`../../messages/${locale}/${namespace}.json`)).default] as const,
    ),
  );
  return Object.fromEntries(entries) as Messages;
}

export type Messages = {
  common: typeof import("../../messages/en/common.json");
  nav: typeof import("../../messages/en/nav.json");
  home: typeof import("../../messages/en/home.json");
  catalog: typeof import("../../messages/en/catalog.json");
  product: typeof import("../../messages/en/product.json");
  cart: typeof import("../../messages/en/cart.json");
  checkout: typeof import("../../messages/en/checkout.json");
  auth: typeof import("../../messages/en/auth.json");
  account: typeof import("../../messages/en/account.json");
  admin: typeof import("../../messages/en/admin.json");
  errors: typeof import("../../messages/en/errors.json");
  notifications: typeof import("../../messages/en/notifications.json");
};
