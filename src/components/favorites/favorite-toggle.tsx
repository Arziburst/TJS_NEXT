"use client";

import { HeartIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "@/components/layout/toast";
import { setFavorite } from "@/app/[locale]/favorites/actions";
import { cn } from "@/lib/utils";
import { settleFavorite, useIsFavorite, wishFavorite } from "./favorites-store";

type FavoriteToggleProps = {
  productId: string;
  /** The piece's title, for the button's accessible name. */
  title: string;
  /** "card": a round button over a catalog photo; "page": next to the price on the product page. */
  variant?: "card" | "page";
  className?: string;
};

/*
 * The heart: a toggle button (aria-pressed) whose name stays the same in both states. It changes at once and
 * goes back if the server refuses or fails (with a toast); the server decides, the browser only shows the wish.
 */
export function FavoriteToggle({ productId, title, variant = "card", className }: FavoriteToggleProps) {
  const t = useTranslations("product.favorites");
  const pressed = useIsFavorite(productId);

  async function onClick() {
    const favorite = !pressed;
    const request = wishFavorite(productId, favorite);
    let ids: string[] | null = null;
    try {
      const result = await setFavorite({ productId, favorite });
      if (result.ok) {
        ids = result.ids;
      } else if (result.reason === "favoritesFull") {
        toast.error(t("errors.favoritesFull"));
      } else if (result.reason === "unavailable") {
        toast.error(t("errors.unavailable"));
      } else if (result.reason === "rateLimited") {
        toast.error(t("errors.rateLimited"));
      } else {
        toast.error(t("errors.unexpectedError"));
      }
    } catch {
      toast.error(t("errors.unexpectedError"));
    }
    settleFavorite(productId, request, ids);
  }

  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={t("toggle", { title })}
      onClick={onClick}
      data-testid="favorite-toggle"
      className={cn(
        // a 44px target; on a card the visible circle inside it is smaller
        "group/heart inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full transition-colors",
          variant === "card" ? "size-8 bg-background/85 shadow-sm" : "size-11 border-2 border-primary",
          "group-hover/heart:text-accent-text",
        )}
      >
        <HeartIcon aria-hidden className={cn("size-5", pressed && "fill-current text-accent-text")} />
      </span>
    </button>
  );
}
