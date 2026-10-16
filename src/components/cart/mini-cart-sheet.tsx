"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useLazySheet } from "@/components/layout/lazy-sheet";
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

const loadPanel = () => import("./mini-cart-panel");
const MiniCartPanel = dynamic(() => loadPanel().then((module) => module.MiniCartPanel), { ssr: false });

// The header's mini-cart below 1024px: a sheet from the right, its code loaded on first use
// (layout/lazy-sheet.ts). Hidden from 1024px up by the caller's CSS.
export function MiniCartSheet({ label, icon, children, className }: MiniCartSheetProps) {
  const { open, setOpen, mounted, triggerProps, finalFocus } = useLazySheet(loadPanel);

  return (
    <>
      <button
        {...triggerProps}
        aria-label={label}
        className={cn("relative inline-flex size-11 items-center justify-center transition-opacity hover:opacity-70 [&_svg]:size-5", className)}
      >
        {icon}
      </button>
      {mounted && (
        <MiniCartPanel open={open} onOpenChange={setOpen} finalFocus={finalFocus}>
          {children}
        </MiniCartPanel>
      )}
    </>
  );
}
