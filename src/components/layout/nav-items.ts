import type { Route } from "next";

export type NavItem = { href: Route; label: string };

// The pages behind these links arrive in later tasks; until then they render the not-found page.
export const NAV_LEFT: readonly NavItem[] = [{ href: "/shop" as Route, label: "Shop" }];
export const NAV_RIGHT: readonly NavItem[] = [{ href: "/about-us" as Route, label: "About us" }];

export const CART_HREF = "/cart" as Route;
export const ACCOUNT_HREF = "/sign-in-and-up" as Route;
