"use client";

import { Menu } from "@base-ui/react/menu";
import { HeartIcon, LayoutDashboardIcon, LogOutIcon, MapPinIcon, PackageIcon, PlusIcon, UserIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition, type RefObject } from "react";
import { ACCOUNT_ADDRESSES_HREF, ACCOUNT_HREF, ACCOUNT_ORDERS_HREF } from "@/components/account/paths";
import { ADMIN_PRODUCTS_HREF, NEW_PRODUCT_HREF } from "@/components/admin/paths";
import { routes } from "@/config/routes";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/actions";
import { useOpenAfterMount } from "./lazy-sheet";

export type AccountMenuPopupProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trigger: the popup is placed against it and gives the focus back to it. */
  trigger: RefObject<HTMLButtonElement | null>;
  displayName: string;
  adminLinks?: { admin: string; addProduct: string };
};

// every signed-in user's own pages (#28); the labels are the nav's
const ACCOUNT_LINKS = [
  { key: "profile", href: ACCOUNT_HREF, icon: UserIcon },
  { key: "orders", href: ACCOUNT_ORDERS_HREF, icon: PackageIcon },
  { key: "addresses", href: ACCOUNT_ADDRESSES_HREF, icon: MapPinIcon },
  { key: "favorites", href: routes.favorites.path, icon: HeartIcon },
] as const;

const itemClass =
  "flex cursor-pointer items-center gap-2 px-3 py-2.5 outline-none select-none data-highlighted:bg-primary data-highlighted:text-primary-foreground";

/** The account menu's popup: who is signed in, their account pages, sign-out. Loaded by AccountMenuClient on first use. */
export function AccountMenuPopup({ open, onOpenChange, trigger, displayName, adminLinks }: AccountMenuPopupProps) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const [signingOut, startSignOut] = useTransition();

  // Called as an action, not through a <form> in the menu: the mobile menu sheet closes (and unmounts this
  // component) on any click in its account slot, which must not cancel the sign-out.
  function handleSignOut() {
    const formData = new FormData();
    formData.set("locale", locale);
    startSignOut(() => signOut(formData));
  }

  return (
    <Menu.Root modal open={useOpenAfterMount(open)} onOpenChange={onOpenChange}>
      <Menu.Portal>
        <Menu.Positioner anchor={trigger} side="bottom" align="end" sideOffset={6} className="z-50">
          <Menu.Popup
            finalFocus={trigger}
            className="min-w-56 border-2 border-primary bg-background p-1 font-sans text-sm text-foreground outline-none data-ending-style:opacity-0 data-starting-style:opacity-0 transition-opacity"
          >
            <Menu.Group>
              <Menu.GroupLabel className="grid gap-0.5 px-3 py-2">
                <span className="font-input text-xs opacity-70">{t("signedInAs")}</span>
                <span className="truncate font-semibold">
                  {displayName}
                </span>
              </Menu.GroupLabel>
            </Menu.Group>
            <Menu.Separator className="my-1 h-0.5 bg-hairline" />
            {ACCOUNT_LINKS.map(({ key, href, icon: Icon }) => (
              // a client navigation keeps the header (and this menu) mounted: the menu closes itself
              <Menu.LinkItem key={key} closeOnClick render={<Link href={href} />} className={itemClass}>
                <Icon aria-hidden className="size-4" />
                {t(key)}
              </Menu.LinkItem>
            ))}
            <Menu.Separator className="my-1 h-0.5 bg-hairline" />
            {adminLinks && (
              <>
                <Menu.LinkItem closeOnClick render={<Link href={ADMIN_PRODUCTS_HREF} />} className={itemClass}>
                  <LayoutDashboardIcon aria-hidden className="size-4" />
                  {adminLinks.admin}
                </Menu.LinkItem>
                <Menu.LinkItem closeOnClick render={<Link href={NEW_PRODUCT_HREF} />} className={itemClass}>
                  <PlusIcon aria-hidden className="size-4" />
                  {adminLinks.addProduct}
                </Menu.LinkItem>
                <Menu.Separator className="my-1 h-0.5 bg-hairline" />
              </>
            )}
            <Menu.Item disabled={signingOut} onClick={handleSignOut} className={itemClass}>
              <LogOutIcon aria-hidden className="size-4" />
              {t("logout")}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
