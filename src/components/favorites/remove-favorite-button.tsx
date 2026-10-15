"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { setFavorite } from "@/app/[locale]/favorites/actions";
import { Button } from "@/components/ui/button";
import { settleFavorite, wishFavorite } from "./favorites-store";

// The favorites page's remove button; the server re-renders the list after the change.
export function RemoveFavoriteButton({ productId, title }: { productId: string; title: string }) {
  const t = useTranslations("product.favorites");
  const tActions = useTranslations("common.actions");
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const request = wishFavorite(productId, false);
      let ids: string[] | null = null;
      try {
        const result = await setFavorite({ productId, favorite: false });
        if (result.ok) ids = result.ids;
        else toast.error(t(result.reason === "rateLimited" ? "errors.rateLimited" : "errors.unexpectedError"));
      } catch {
        toast.error(t("errors.unexpectedError"));
      }
      settleFavorite(productId, request, ids);
    });
  }

  return (
    <Button
      type="button"
      variant="link"
      className="self-start px-0 text-accent-text underline"
      onClick={onClick}
      disabled={isPending}
      aria-label={t("remove", { title })}
    >
      {tActions("remove")}
    </Button>
  );
}
