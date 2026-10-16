"use client";

import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MenuBarsIcon } from "./icons";
import { useLazySheet } from "./lazy-sheet";

type MobileMenuProps = {
  className?: string;
  languageSwitcher: ReactNode;
  currencySwitcher: ReactNode;
  account: ReactNode;
  footer: ReactNode;
};

const loadSheet = () => import("./mobile-menu-sheet");
const MobileMenuSheet = dynamic(() => loadSheet().then((module) => module.MobileMenuSheet), { ssr: false });

// Full-width sheet from the left; hidden from 1024px up by the caller's CSS, never by window width. The sheet's
// code loads on first use (lazy-sheet.ts).
export function MobileMenu({ className, languageSwitcher, currencySwitcher, account, footer }: MobileMenuProps) {
  const t = useTranslations("nav");
  const { open, setOpen, mounted, triggerProps, finalFocus } = useLazySheet(loadSheet);

  return (
    <>
      <button
        {...triggerProps}
        aria-label={t("openMenu")}
        className={cn("flex h-11 items-center transition-opacity hover:opacity-70", className)}
      >
        <MenuBarsIcon />
      </button>
      {mounted && (
        <MobileMenuSheet
          open={open}
          onOpenChange={setOpen}
          finalFocus={finalFocus}
          languageSwitcher={languageSwitcher}
          currencySwitcher={currencySwitcher}
          account={account}
          footer={footer}
        />
      )}
    </>
  );
}
