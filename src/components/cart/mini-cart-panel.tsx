"use client";

import { useTranslations } from "next-intl";
import type { MouseEvent, ReactNode } from "react";
import { MenuCloseIcon } from "@/components/layout/icons";
import { useOpenAfterMount, type LazySheetProps } from "@/components/layout/lazy-sheet";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";

// The mini-cart's sheet from the right; loaded by MiniCartSheet on first use.
export function MiniCartPanel({ open, onOpenChange, finalFocus, children }: LazySheetProps & { children: ReactNode }) {
  const t = useTranslations("nav");
  // any link inside (a product, the cart page, the shop) closes the sheet as it navigates
  const closeOnLink = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest("a")) onOpenChange(false);
  };

  return (
    <Sheet open={useOpenAfterMount(open)} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} finalFocus={finalFocus} className="gap-0">
        <div className="page-container flex items-center justify-between py-4">
          <SheetTitle className="font-display text-3xl uppercase">{t("cart")}</SheetTitle>
          <SheetClose aria-label={t("closeCart")} className="flex h-11 items-center transition-opacity hover:opacity-70">
            <MenuCloseIcon />
          </SheetClose>
        </div>
        <div className="page-container flex grow flex-col pb-6" onClick={closeOnLink}>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
