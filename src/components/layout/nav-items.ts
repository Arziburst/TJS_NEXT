// Locale-less paths; the next-intl Link adds the current locale prefix.
export type NavItem = { href: string; labelKey: "shop" | "aboutUs" };

// The pages behind these links arrive in later tasks; until then they render the not-found page.
export const NAV_LEFT: readonly NavItem[] = [{ href: "/shop", labelKey: "shop" }];
export const NAV_RIGHT: readonly NavItem[] = [{ href: "/about-us", labelKey: "aboutUs" }];

export const CART_HREF = "/cart";
export const ACCOUNT_HREF = "/sign-in-and-up";
