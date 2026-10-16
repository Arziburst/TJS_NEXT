"use client";

import { XIcon } from "lucide-react";
import { useOpenAfterMount, type LazySheetProps } from "@/components/layout/lazy-sheet";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { FilterPanel, type FilterPanelProps } from "./filter-panel";

export type FilterSheetPanelProps = LazySheetProps &
  Omit<FilterPanelProps, "autoApply" | "onApply" | "idPrefix" | "className"> & { title: string; closeLabel: string };

// The filters' sheet from the bottom; loaded by FilterSheet on first use.
export function FilterSheetPanel({ open, onOpenChange, finalFocus, title, closeLabel, ...panel }: FilterSheetPanelProps) {
  return (
    <Sheet open={useOpenAfterMount(open)} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} finalFocus={finalFocus} className="max-h-[85dvh] gap-0">
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
          onApply={() => onOpenChange(false)}
          className="page-container pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        />
      </SheetContent>
    </Sheet>
  );
}
