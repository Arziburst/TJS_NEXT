"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-items";

type NavLinkProps = NavItem & {
  className?: string;
  onNavigate?: () => void;
};

// The active route stays coral; the coral underline slides on hover and keyboard focus.
export function NavLink({ href, label, className, onNavigate }: NavLinkProps) {
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
      {label}
    </Link>
  );
}
