import Link from "next/link";
import { ShoppingBagIcon, UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCOUNT_HREF, CART_HREF } from "./nav-items";

const iconLink =
  "inline-flex size-11 items-center justify-center transition-opacity hover:opacity-70 focus-visible:opacity-70 [&_svg]:size-5";

// Default contents of the header slots; the cart, account and language tasks replace them.
export function CartSlot({ className }: { className?: string }) {
  return (
    <Link href={CART_HREF} aria-label="Cart" className={cn(iconLink, className)}>
      <ShoppingBagIcon aria-hidden />
    </Link>
  );
}

export function AccountSlot({ className }: { className?: string }) {
  return (
    <Link href={ACCOUNT_HREF} aria-label="Account" className={cn(iconLink, className)}>
      <UserIcon aria-hidden />
    </Link>
  );
}

export function LanguageSwitcherSlot({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-11 items-center font-sans text-sm font-semibold uppercase", className)}>
      EN
    </span>
  );
}
