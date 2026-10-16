"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useLazySheet } from "@/components/layout/lazy-sheet";
import { cn } from "@/lib/utils";
import type { FilterPanelProps } from "./filter-panel";

type FilterSheetProps = Omit<FilterPanelProps, "autoApply" | "onApply" | "idPrefix" | "className"> & {
  /** The trigger's text, with the number of filters set. */
  openLabel: string;
  title: string;
  closeLabel: string;
  className?: string;
};

const loadPanel = () => import("./filter-sheet-panel");
const FilterSheetPanel = dynamic(() => loadPanel().then((module) => module.FilterSheetPanel), { ssr: false });

/**
 * Below 1024px the filters open in a sheet from the bottom; they apply with its button, which closes it. The
 * sheet's code loads on first use (layout/lazy-sheet.ts).
 */
export function FilterSheet({ openLabel, className, ...panel }: FilterSheetProps) {
  const { open, setOpen, mounted, triggerProps, finalFocus } = useLazySheet(loadPanel);

  return (
    <>
      <button
        {...triggerProps}
        className={cn(
          "flex h-11 w-full items-center justify-center gap-2 border-2 border-primary font-sans text-sm font-semibold uppercase transition hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        <SlidersHorizontalIcon aria-hidden className="size-4" />
        {openLabel}
      </button>
      {mounted && <FilterSheetPanel {...panel} open={open} onOpenChange={setOpen} finalFocus={finalFocus} />}
    </>
  );
}
