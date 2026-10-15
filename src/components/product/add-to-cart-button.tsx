"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { AddToCartResult } from "@/app/[locale]/product/[slug]/actions";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { Link } from "@/i18n/navigation";
import type { ProductFulfillment } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

type AddToCartButtonProps = {
  productId: string;
  fulfillment: ProductFulfillment;
  /** How many of this product the visitor's cart already holds (streamed in; 0 until then). */
  inCart: number;
  /** The most one cart line may hold (D36); passed in so the client never decides a limit itself. */
  max: number;
  addToCart: (input: { productId: string }) => Promise<AddToCartResult>;
  className?: string;
};

/*
 * A one-of-a-kind piece is added once: then the button says so and stays off (as in the legacy shop).
 * Made-to-order work can be added again, each click one more piece, up to the maximum; the server decides.
 */
export function AddToCartButton({ productId, fulfillment, inCart, max, addToCart, className }: AddToCartButtonProps) {
  const t = useTranslations("product");
  // the server's last answer wins over the streamed count
  const [quantity, setQuantity] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const current = quantity ?? inCart;
  const oneOfAKind = fulfillment === "one_of_a_kind";
  const done = oneOfAKind ? current > 0 : current >= max;

  function onClick() {
    startTransition(async () => {
      const result = await addToCart({ productId });
      if (result.ok) {
        setQuantity(result.quantity);
        toast.success(oneOfAKind || result.quantity === 1 ? t("cart.added") : t("cart.quantityRaised", { count: result.quantity }));
        return;
      }
      switch (result.reason) {
        case "alreadyInCart":
          setQuantity(1);
          toast.info(t("cart.alreadyInCart"));
          break;
        case "maxQuantity":
          setQuantity(max);
          toast.info(t("cart.maxQuantity", { max }));
          break;
        case "cartFull":
          toast.error(t("cart.cartFull"));
          break;
        case "unavailable":
          toast.error(t("cart.unavailable"));
          break;
        case "rateLimited":
          toast.error(t("cart.rateLimited"));
          break;
        default:
          toast.error(t("page.addToCartFailed"));
      }
    });
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Button type="button" onClick={onClick} disabled={done || isPending} aria-live="polite" className="sb:self-start">
        {oneOfAKind && current > 0 ? t("addedToCart") : t("addToCart")}
      </Button>
      {current > 0 && (
        <p className="flex flex-wrap gap-x-3 text-sm" data-testid="in-cart">
          {!oneOfAKind && <span>{t("cart.inCart", { count: current })}</span>}
          {!oneOfAKind && current >= max && <span>{t("cart.maxQuantity", { max })}</span>}
          <Link href={routes.cart.path} className="text-accent-text underline underline-offset-4">
            {t("cart.viewCart")}
          </Link>
        </p>
      )}
    </div>
  );
}
