"use client";

import { InboxIcon, PackageIcon, PlusIcon, SettingsIcon, StoreIcon, TagsIcon } from "lucide-react";
import { routes } from "@/config/routes";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_ATTRIBUTES_HREF, ADMIN_ORDERS_HREF, ADMIN_PRODUCTS_HREF, ADMIN_SETTINGS_HREF, NEW_PRODUCT_HREF } from "./paths";

const ENTRIES = {
  // the order list and every order's page (#27)
  orders: {
    href: ADMIN_ORDERS_HREF,
    icon: InboxIcon,
    isActive: (path: string) => path === ADMIN_ORDERS_HREF || path.startsWith(`${ADMIN_ORDERS_HREF}/`),
  },
  // the list and every product's edit page
  products: {
    href: ADMIN_PRODUCTS_HREF,
    icon: PackageIcon,
    isActive: (path: string) =>
      path === ADMIN_PRODUCTS_HREF || (path.startsWith(`${ADMIN_PRODUCTS_HREF}/products/`) && path !== NEW_PRODUCT_HREF),
  },
  add: { href: NEW_PRODUCT_HREF, icon: PlusIcon, isActive: (path: string) => path === NEW_PRODUCT_HREF },
  // the materials and colours of the filters (#25)
  attributes: { href: ADMIN_ATTRIBUTES_HREF, icon: TagsIcon, isActive: (path: string) => path === ADMIN_ATTRIBUTES_HREF },
  // the settings and the About page editor
  settings: {
    href: ADMIN_SETTINGS_HREF,
    icon: SettingsIcon,
    isActive: (path: string) => path === ADMIN_SETTINGS_HREF || path.startsWith(`${ADMIN_SETTINGS_HREF}/`),
  },
  shop: { href: routes.shop.path, icon: StoreIcon, isActive: () => false },
} as const;

type AdminNavLinkProps = {
  entry: keyof typeof ENTRIES;
  label: string;
  /** A count shown on the entry (the new order requests), with the entry's whole name for screen readers. */
  badge?: { count: number; label: string };
};

/**
 * An admin navigation entry: a thumb-sized tab with icon and label in the phone's bottom bar, a row in
 * the desktop sidebar. The current page is marked with aria-current and the coral accent.
 */
export function AdminNavLink({ entry, label, badge }: AdminNavLinkProps) {
  const pathname = usePathname();
  const { href, icon: Icon, isActive } = ENTRIES[entry];
  const active = isActive(pathname);
  const count = badge && badge.count > 0 ? badge : null;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={count?.label}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-1 px-0.5 font-sans text-xs font-semibold outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sb:min-h-11 sb:flex-row sb:justify-start sb:gap-3 sb:px-3 sb:text-sm",
        active ? "text-accent-text" : "hover:text-accent-text",
      )}
    >
      <span className={cn("relative shrink-0", count && "sb:mr-2")}>
        <Icon aria-hidden className="size-5" />
        {count && (
          <span
            aria-hidden
            data-testid={`admin-nav-badge-${entry}`}
            className="absolute -top-2 -right-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 font-sans text-[0.6875rem] leading-none font-bold text-foreground tabular-nums"
          >
            {count.count > 99 ? "99+" : count.count}
          </span>
        )}
      </span>
      {/* five tabs share a phone's width: a long word is hyphenated or broken rather than cut off */}
      <span className="max-w-full text-center text-[0.625rem] leading-tight hyphens-auto [overflow-wrap:anywhere] sb:text-left sb:text-sm sb:[overflow-wrap:normal]">
        {label}
      </span>
    </Link>
  );
}
