"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AddToCartResult } from "@/app/[locale]/product/[slug]/actions";

type AddToCartButtonProps = {
  productId: string;
  addToCart: (input: { productId: string }) => Promise<AddToCartResult>;
  className?: string;
};

// Each piece is ordered once (quantity 1, as in the legacy shop): once added, the button says so and stays off.
export function AddToCartButton({ productId, addToCart, className }: AddToCartButtonProps) {
  const t = useTranslations("product");
  const [added, setAdded] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await addToCart({ productId });
      if (result.ok) setAdded(true);
      else toast.error(t("page.addToCartFailed"));
    });
  }

  return (
    <Button type="button" onClick={onClick} disabled={added || isPending} aria-live="polite" className={className}>
      {added ? t("addedToCart") : t("addToCart")}
    </Button>
  );
}
