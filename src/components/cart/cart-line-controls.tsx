"use client";

import { MinusIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "@/components/layout/toast";
import { removeFromCart, updateCartQuantity } from "@/app/[locale]/cart/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CartLineControlsProps = {
  productId: string;
  /** The line's size (#66); null for a product without sizes. */
  variantId: string | null;
  /** The line's name for screen readers, with its size. */
  title: string;
  quantity: number;
  /** The most this line may hold; 1 for a one-of-a-kind piece. Null: the piece cannot be ordered, only removed. */
  max: number | null;
  className?: string;
};

// Quantity stepper and remove button of one cart line; the server re-renders the cart after each change.
export function CartLineControls({ productId, variantId, title, quantity, max, className }: CartLineControlsProps) {
  const t = useTranslations("cart");
  const tActions = useTranslations("common.actions");
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; reason: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) return;
      if (result.reason === "rateLimited") toast.error(t("errors.rateLimited"));
      else if (result.reason === "unavailable") toast.error(t("errors.unavailable"));
      else toast.error(t("errors.unexpectedError"));
    });
  }

  const setQuantity = (next: number) => run(() => updateCartQuantity({ productId, variantId, quantity: next }));
  const remove = () => run(() => removeFromCart({ productId, variantId }));

  return (
    <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-2", className)} aria-busy={isPending}>
      {max !== null && max > 1 && (
        <div role="group" aria-label={t("quantityOf", { title })} className="flex items-center border-2 border-primary">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setQuantity(quantity - 1)}
            disabled={isPending || quantity <= 1}
            aria-label={t("decrease", { title })}
          >
            <MinusIcon aria-hidden />
          </Button>
          <output className="min-w-8 text-center font-sans tabular-nums" aria-live="polite">
            {quantity}
          </output>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setQuantity(quantity + 1)}
            disabled={isPending || quantity >= max}
            aria-label={t("increase", { title })}
          >
            <PlusIcon aria-hidden />
          </Button>
        </div>
      )}
      {max !== null && max > 1 && quantity >= max && <p className="text-sm">{t("maxQuantity", { max })}</p>}
      <Button
        type="button"
        variant="link"
        className="px-0 text-accent-text underline"
        onClick={remove}
        disabled={isPending}
        aria-label={t("removeLine", { title })}
      >
        {tActions("remove")}
      </Button>
    </div>
  );
}
