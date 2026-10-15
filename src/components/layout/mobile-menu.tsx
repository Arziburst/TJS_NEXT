"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { SearchForm } from "@/components/search/search-form";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { isRouteEnabled } from "@/config/routes";
import { cn } from "@/lib/utils";
import { MenuBarsIcon, MenuCloseIcon } from "./icons";
import { Logo } from "./logo";
import { NAV_LEFT, NAV_RIGHT } from "./nav-items";
import { NavLink } from "./nav-link";

type MobileMenuProps = {
  className?: string;
  languageSwitcher: ReactNode;
  currencySwitcher: ReactNode;
  account: ReactNode;
  footer: ReactNode;
};

// Full-width sheet from the left; hidden from 1024px up by the caller's CSS, never by window width.
export function MobileMenu({ className, languageSwitcher, currencySwitcher, account, footer }: MobileMenuProps) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={t("openMenu")}
        className={cn("flex h-11 items-center transition-opacity hover:opacity-70", className)}
      >
        <MenuBarsIcon />
      </SheetTrigger>
      <SheetContent side="left" showCloseButton={false} className="gap-0">
        <div className="page-container flex items-center justify-between py-4">
          <SheetClose aria-label={t("closeMenu")} className="flex h-11 items-center transition-opacity hover:opacity-70">
            <MenuCloseIcon />
          </SheetClose>
          <SheetTitle render={<div />}>
            <Logo onNavigate={close} />
          </SheetTitle>
          <span className="w-[25px]" aria-hidden />
        </div>
        {isRouteEnabled("search") && (
          <div className="page-container pt-2">
            <SearchForm id="menu-search" onSubmit={close} />
          </div>
        )}
        <nav aria-label={t("main")} className="page-container flex grow flex-col">
          <ul className="flex grow flex-col items-center justify-evenly gap-5 py-6">
            {[...NAV_LEFT, ...NAV_RIGHT].map((item) => (
              <li key={item.href}>
                <NavLink {...item} onNavigate={close} />
              </li>
            ))}
            <li className="flex flex-col items-center gap-2" data-slot="mobile-language-switcher">
              <span className="font-sans text-base font-semibold tracking-[1.6px] italic">{t("language")}</span>
              {languageSwitcher}
            </li>
            <li className="flex flex-col items-center gap-2" data-slot="mobile-currency-switcher">
              <span className="font-sans text-base font-semibold tracking-[1.6px] italic">{t("currency")}</span>
              {currencySwitcher}
            </li>
            {account && (
              <li data-slot="mobile-account" onClick={close}>
                {account}
              </li>
            )}
          </ul>
        </nav>
        {footer}
      </SheetContent>
    </Sheet>
  );
}
