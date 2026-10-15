"use client";

import { Menu } from "@base-ui/react/menu";
import { LayoutDashboardIcon, LogOutIcon, PlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { ADMIN_PRODUCTS_HREF, NEW_PRODUCT_HREF } from "@/components/admin/paths";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

type AccountMenuClientProps = {
  // what the menu shows: the profile name, else the email
  displayName: string;
  // an admin's entries with their labels, given by the server only for an admin (the role comes from the
  // database; the admin pages check it again), so no other visitor receives them
  adminLinks?: { admin: string; addProduct: string };
  className?: string;
};

const itemClass =
  "flex cursor-pointer items-center gap-2 px-3 py-2.5 outline-none select-none data-highlighted:bg-primary data-highlighted:text-primary-foreground";

// Legacy avatar: the first two letters of the name.
function initials(displayName: string): string {
  return displayName.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase();
}

/** The signed-in user's menu in the header's account slot: who is signed in, and sign-out. */
export function AccountMenuClient({ displayName, adminLinks, className }: AccountMenuClientProps) {
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
    <Menu.Root modal>
      <Menu.Trigger
        aria-label={t("account")}
        // the mobile menu sheet closes on clicks in its account slot (meant for links); this one only opens
        // the account menu, so the sheet stays
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "inline-flex size-11 items-center justify-center transition-opacity outline-none hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-popup-open:opacity-70",
          className,
        )}
      >
        <span
          aria-hidden
          className="inline-flex size-9 items-center justify-center rounded-full border-2 border-primary font-sans text-xs font-semibold"
        >
          {initials(displayName)}
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Menu.Popup className="min-w-56 border-2 border-primary bg-background p-1 font-sans text-sm text-foreground outline-none data-ending-style:opacity-0 data-starting-style:opacity-0 transition-opacity">
            <Menu.Group>
              <Menu.GroupLabel className="grid gap-0.5 px-3 py-2">
                <span className="font-input text-xs opacity-70">{t("signedInAs")}</span>
                <span className="truncate font-semibold">
                  {displayName}
                </span>
              </Menu.GroupLabel>
            </Menu.Group>
            <Menu.Separator className="my-1 h-0.5 bg-hairline" />
            {adminLinks && (
              <>
                <Menu.LinkItem render={<Link href={ADMIN_PRODUCTS_HREF} />} className={itemClass}>
                  <LayoutDashboardIcon aria-hidden className="size-4" />
                  {adminLinks.admin}
                </Menu.LinkItem>
                <Menu.LinkItem render={<Link href={NEW_PRODUCT_HREF} />} className={itemClass}>
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
