"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type RefObject } from "react";

/*
 * A sheet whose code loads on first use (#105): the trigger is a plain button that hydrates with the page, the
 * sheet itself (Base UI's dialog) is a dynamic import fetched when the pointer or the focus reaches the trigger
 * and rendered from the first click on, so no page loads the dialog code before its largest paint.
 */
export function useLazySheet(load: () => Promise<unknown>) {
  const [open, setOpen] = useState(false);
  // once opened, the sheet stays mounted (closed), so it opens again at once
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const preload = () => void load();

  const triggerProps = {
    ref: triggerRef,
    type: "button",
    // what Base UI's dialog trigger announces
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    onPointerEnter: preload,
    onTouchStart: preload,
    onFocus: preload,
    onClick: () => {
      setMounted(true);
      setOpen(true);
    },
  } satisfies ButtonHTMLAttributes<HTMLButtonElement> & { ref: RefObject<HTMLButtonElement | null> };

  // focus goes back to the trigger when the sheet closes, as with Base UI's own trigger
  return { open, setOpen, mounted, triggerProps, finalFocus: triggerRef };
}

/**
 * The `open` of a sheet that mounts already open: closed for its first render, so Base UI plays the opening
 * transition (its starting style) as it does for a sheet that was mounted closed.
 */
export function useOpenAfterMount(open: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return ready && open;
}

export type LazySheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
};
