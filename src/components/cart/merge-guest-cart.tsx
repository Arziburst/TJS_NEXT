"use client";

import { useEffect, useRef } from "react";
import { mergeGuestCart } from "@/app/[locale]/cart/actions";

/*
 * Rendered by the header when a signed-in shopper still has a guest cart cookie (they signed in after
 * adding pieces as a guest): writes those lines into the account once. The merge is idempotent, and the cart
 * already shows the merged lines before it runs, so a failed or repeated call changes nothing visible.
 */
export function MergeGuestCart() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void mergeGuestCart();
  }, []);
  return null;
}
