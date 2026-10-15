import type { Metadata } from "next";
import { Suspense } from "react";

// The admin area is never indexed; the sitemap (none yet) must not list it either.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/*
 * Every admin page checks the admin itself (requireAdmin) and renders the admin frame only after that check,
 * at request time. The static shell holds nothing but this empty placeholder: no admin text, link or data
 * reaches a guest or a customer, not even for a moment (the legacy app showed its admin pages before the
 * role check).
 */
export default function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  return <Suspense fallback={<div className="min-h-[70vh] flex-1" />}>{children}</Suspense>;
}
