"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-items";

type NavLinkProps = NavItem & {
  className?: string;
  onNavigate?: () => void;
};

// The active route stays coral; the coral underline slides on hover and keyboard focus.
export function NavLink({ href, labelKey, className, onNavigate }: NavLinkProps) {
  const t = useTranslations("nav");
  // the pathname without the locale prefix
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "move-underline font-sans text-base font-semibold tracking-[1.6px] capitalize italic sb:text-sm sb:not-italic",
        isActive && "text-accent",
        className,
      )}
    >
      {t(labelKey)}
    </Link>
  );
}
