import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CurrencySwitcherSlot } from "@/components/currency-switcher-slot";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { isRouteEnabled } from "@/config/routes";
import { cn } from "@/lib/utils";
import { AccountSlot, CartSlot } from "./header-slots";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";
import { NAV_LEFT, NAV_RIGHT } from "./nav-items";
import { NavLink } from "./nav-link";

type HeaderProps = {
  className?: string;
  cart?: ReactNode;
  account?: ReactNode;
  languageSwitcher?: ReactNode;
  currencySwitcher?: ReactNode;
  // rendered at the bottom of the mobile menu
  menuFooter?: ReactNode;
};

/*
 * Below 1024px: menu button, logo, cart. From 1024px: logo, inline nav, language and currency, cart and account
 * side by side on the nav's row (stacked, they made the header taller: #80).
 * The switch is CSS only (sb:hidden / hidden sb:flex); both variants are always in the markup.
 */
export function Header({
  className,
  // the default slots link to their page only once it exists (src/config/routes.ts)
  cart = isRouteEnabled("cart") ? <CartSlot /> : null,
  account = isRouteEnabled("signIn") ? <AccountSlot /> : null,
  languageSwitcher = <LocaleSwitcher hideLabel />,
  currencySwitcher = <CurrencySwitcherSlot hideLabel />,
  menuFooter,
}: HeaderProps) {
  const t = useTranslations("nav");

  return (
    <header className={cn("sticky top-0 z-40 bg-background", className)}>
      <div className="page-container flex items-center justify-between gap-4 py-4 sb:items-start sb:gap-x-[70px] sb:pt-6 sb:pb-3">
        <MobileMenu
          className="sb:hidden"
          languageSwitcher={languageSwitcher}
          currencySwitcher={currencySwitcher}
          account={account}
          footer={menuFooter}
        />
        <Logo className="sb:flex sb:h-11 sb:items-center" />
        <nav aria-label={t("main")} className="hidden grow items-start gap-x-[70px] sb:flex">
          <ul className="flex h-11 w-full items-center justify-between">
            {NAV_LEFT.map((item) => (
              <li key={item.href}>
                <NavLink {...item} />
              </li>
            ))}
            {NAV_RIGHT.map((item) => (
              <li key={item.href} className="text-right">
                <NavLink {...item} />
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-4">
            <div data-slot="language-switcher">{languageSwitcher}</div>
            <div data-slot="currency-switcher">{currencySwitcher}</div>
          </div>
        </nav>
        <ul className="flex min-w-11 items-center">
          {cart && <li data-slot="cart">{cart}</li>}
          {account && (
            <li data-slot="account" className="hidden sb:block">
              {account}
            </li>
          )}
        </ul>
      </div>
    </header>
  );
}
