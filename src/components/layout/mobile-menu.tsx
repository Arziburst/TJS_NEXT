"use client";

import { useState, type ReactNode } from "react";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MenuBarsIcon, MenuCloseIcon } from "./icons";
import { Logo } from "./logo";
import { NAV_LEFT, NAV_RIGHT } from "./nav-items";
import { NavLink } from "./nav-link";

type MobileMenuProps = {
  className?: string;
  languageSwitcher: ReactNode;
  account: ReactNode;
  footer: ReactNode;
};

// Full-width sheet from the left; hidden from 1024px up by the caller's CSS, never by window width.
export function MobileMenu({ className, languageSwitcher, account, footer }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open menu"
        className={cn("flex h-11 items-center transition-opacity hover:opacity-70", className)}
      >
        <MenuBarsIcon />
      </SheetTrigger>
      <SheetContent side="left" showCloseButton={false} className="gap-0">
        <div className="page-container flex items-center justify-between py-4">
          <SheetClose aria-label="Close menu" className="flex h-11 items-center transition-opacity hover:opacity-70">
            <MenuCloseIcon />
          </SheetClose>
          <SheetTitle render={<div />}>
            <Logo onNavigate={close} />
          </SheetTitle>
          <span className="w-[25px]" aria-hidden />
        </div>
        <nav aria-label="Main" className="page-container flex grow flex-col">
          <ul className="flex grow flex-col items-center justify-evenly gap-5 py-6">
            {[...NAV_LEFT, ...NAV_RIGHT].map((item) => (
              <li key={item.href}>
                <NavLink {...item} onNavigate={close} />
              </li>
            ))}
            <li className="flex flex-col items-center gap-2" data-slot="mobile-language-switcher">
              <span className="font-sans text-base font-semibold tracking-[1.6px] italic">Language</span>
              {languageSwitcher}
            </li>
            <li data-slot="mobile-account" onClick={close}>
              {account}
            </li>
          </ul>
        </nav>
        {footer}
      </SheetContent>
    </Sheet>
  );
}
