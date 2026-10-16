import type { Metadata } from "next";

// A customer's own pages: never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/*
 * Every account page checks the user itself (requireUser: a guest goes to sign in and comes back) inside its
 * own <Suspense>, and renders the account frame only after that check, at request time. The static shell holds
 * only the placeholder.
 */
export default function AccountLayout({ children }: LayoutProps<"/[locale]/account">) {
  return children;
}
