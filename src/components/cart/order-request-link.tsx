import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button-variants";
import { isRouteEnabled, routes } from "@/config/routes";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type OrderRequestLinkProps = {
  /** Unique per page: the header's mini-cart and the cart page both show the button. */
  id: string;
  /** No orderable piece in the cart. */
  disabled?: boolean;
  className?: string;
};

/*
 * The cart's next step: the order request (#24). Until that page exists the button is shown switched off with
 * a visible TBD, and links nowhere (a link to a missing page would answer its prefetch with a 404).
 */
export async function OrderRequestLink({ id, disabled = false, className }: OrderRequestLinkProps) {
  const t = await getTranslations("cart");
  const enabled = isRouteEnabled("orderRequest");
  if (enabled && !disabled) {
    return (
      <Link href={routes.orderRequest.path} className={cn(buttonVariants(), className)}>
        {t("orderRequest")}
      </Link>
    );
  }
  const noteId = `${id}-note`;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button type="button" disabled className={cn(buttonVariants())} aria-describedby={noteId}>
        {t("orderRequest")}
      </button>
      <p id={noteId} className="text-center text-sm">
        {enabled ? t("nothingToOrder") : t("orderRequestTbd")}
      </p>
    </div>
  );
}
