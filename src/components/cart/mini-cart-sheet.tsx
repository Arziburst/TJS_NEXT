"use client";

import { useTranslations } from "next-intl";
import { useState, type MouseEvent, type ReactNode } from "react";
import { MenuCloseIcon } from "@/components/layout/icons";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type MiniCartSheetProps = {
  /** The trigger's accessible name, with the count ("Cart, 3 pieces"). */
  label: string;
  /** The trigger's visible content: the bag icon and its count. */
  icon: ReactNode;
  /** The server-rendered cart summary. */
  children: ReactNode;
  className?: string;
};

// The header's mini-cart below 1024px: a sheet from the right. Hidden from 1024px up by the caller's CSS.
export function MiniCartSheet({ label, icon, children, className }: MiniCartSheetProps) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  // any link inside (a product, the cart page, the shop) closes the sheet as it navigates
  const closeOnLink = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={label}
        className={cn("relative inline-flex size-11 items-center justify-center transition-opacity hover:opacity-70 [&_svg]:size-5", className)}
      >
        {icon}
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false} className="gap-0">
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
