import { ShoppingBagIcon, UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ACCOUNT_HREF, CART_HREF } from "./nav-items";

const iconLink =
  "inline-flex size-11 items-center justify-center transition-opacity hover:opacity-70 focus-visible:opacity-70 [&_svg]:size-5";

// Default contents of the cart and account slots; the cart and account tasks replace them.
export function CartSlot({ className }: { className?: string }) {
  const t = useTranslations("nav");
  return (
    <Link href={CART_HREF} aria-label={t("cart")} className={cn(iconLink, className)}>
      <ShoppingBagIcon aria-hidden />
    </Link>
  );
}

export function AccountSlot({ className }: { className?: string }) {
  const t = useTranslations("nav");
  return (
    <Link href={ACCOUNT_HREF} aria-label={t("account")} className={cn(iconLink, className)}>
      <UserIcon aria-hidden />
    </Link>
  );
}
