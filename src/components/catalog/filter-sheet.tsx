"use client";

import { SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { FilterPanel, type FilterPanelProps } from "./filter-panel";

type FilterSheetProps = Omit<FilterPanelProps, "autoApply" | "onApply" | "idPrefix" | "className"> & {
  /** The trigger's text, with the number of filters set. */
  openLabel: string;
  title: string;
  closeLabel: string;
  className?: string;
};

/** Below 1024px the filters open in a sheet from the bottom; they apply with its button, which closes it. */
export function FilterSheet({ openLabel, title, closeLabel, className, ...panel }: FilterSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(
          "flex h-11 w-full items-center justify-center gap-2 border-2 border-primary font-sans text-sm font-semibold uppercase transition hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        <SlidersHorizontalIcon aria-hidden className="size-4" />
        {openLabel}
      </SheetTrigger>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[85dvh] gap-0">
        <div className="page-container sticky top-0 z-10 flex items-center justify-between bg-background py-3">
          <SheetTitle className="font-sans text-base font-semibold tracking-[0.2em]">{title}</SheetTitle>
          <SheetClose aria-label={closeLabel} className="inline-flex size-11 items-center justify-center hover:opacity-70">
            <XIcon aria-hidden className="size-5" />
          </SheetClose>
        </div>
        <FilterPanel
          {...panel}
          idPrefix="sheet"
          autoApply={false}
          onApply={() => setOpen(false)}
          className="page-container pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        />
      </SheetContent>
    </Sheet>
  );
}
