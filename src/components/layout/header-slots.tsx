import { HeartIcon, ShoppingBagIcon, UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { routes } from "@/config/routes";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const iconLink =
  "inline-flex size-11 items-center justify-center transition-opacity hover:opacity-70 focus-visible:opacity-70 [&_svg]:size-5";

// Default contents of the favorites, cart and account slots, and the placeholders of the streamed ones.
export function FavoritesSlot({ className }: { className?: string }) {
  const t = useTranslations("nav");
  return (
    <Link href={routes.favorites.path} aria-label={t("favorites")} className={cn(iconLink, className)}>
      <HeartIcon aria-hidden />
    </Link>
  );
}

export function CartSlot({ className }: { className?: string }) {
  const t = useTranslations("nav");
  return (
    <Link href={routes.cart.path}aria-label={t("cart")} className={cn(iconLink, className)}>
      <ShoppingBagIcon aria-hidden />
    </Link>
  );
}

export function AccountSlot({ className }: { className?: string }) {
  const t = useTranslations("nav");
  return (
    <Link href={routes.signIn.path}aria-label={t("account")} className={cn(iconLink, className)}>
      <UserIcon aria-hidden />
    </Link>
  );
}
