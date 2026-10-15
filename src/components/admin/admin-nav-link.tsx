"use client";

import { PackageIcon, PlusIcon, SettingsIcon, StoreIcon } from "lucide-react";
import { routes } from "@/config/routes";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_PRODUCTS_HREF, ADMIN_SETTINGS_HREF, NEW_PRODUCT_HREF } from "./paths";

const ENTRIES = {
  // the list and every product's edit page
  products: {
    href: ADMIN_PRODUCTS_HREF,
    icon: PackageIcon,
    isActive: (path: string) =>
      path === ADMIN_PRODUCTS_HREF || (path.startsWith(`${ADMIN_PRODUCTS_HREF}/products/`) && path !== NEW_PRODUCT_HREF),
  },
  add: { href: NEW_PRODUCT_HREF, icon: PlusIcon, isActive: (path: string) => path === NEW_PRODUCT_HREF },
  // the settings and the About page editor
  settings: {
    href: ADMIN_SETTINGS_HREF,
    icon: SettingsIcon,
    isActive: (path: string) => path === ADMIN_SETTINGS_HREF || path.startsWith(`${ADMIN_SETTINGS_HREF}/`),
  },
  shop: { href: routes.shop.path, icon: StoreIcon, isActive: () => false },
} as const;

/**
 * An admin navigation entry: a thumb-sized tab with icon and label in the phone's bottom bar, a row in
 * the desktop sidebar. The current page is marked with aria-current and the coral accent.
 */
export function AdminNavLink({ entry, label }: { entry: keyof typeof ENTRIES; label: string }) {
  const pathname = usePathname();
  const { href, icon: Icon, isActive } = ENTRIES[entry];
  const active = isActive(pathname);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-1 px-2 font-sans text-xs font-semibold outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sb:min-h-11 sb:flex-row sb:justify-start sb:gap-3 sb:px-3 sb:text-sm",
        active ? "text-accent-text" : "hover:text-accent-text",
      )}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}
