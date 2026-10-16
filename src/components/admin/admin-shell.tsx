import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AdminNavLink } from "./admin-nav-link";

/**
 * What an admin page shows until its admin check and data are ready: empty space, never admin text (a guest
 * or customer receives exactly this). Each page has its own boundary, so a navigation between admin pages
 * (below the shared admin layout) gets it too.
 */
export function AdminPending() {
  return <div aria-busy className="min-h-[70vh] flex-1" />;
}

/*
 * The admin area's frame, rendered by each admin page after requireAdmin() (never in a static shell, so a
 * guest or customer never receives it). On a phone the navigation is a bottom bar within thumb reach that
 * stays in view while the page scrolls (sticky, so it never covers the footer); from `sb` on it is a
 * sidebar left of the content.
 */
export async function AdminShell({ children }: { children: ReactNode }) {
  const [t, messages] = await Promise.all([getTranslations("admin.shell"), getMessages()]);

  return (
    <NextIntlClientProvider
      messages={{
        admin: messages.admin,
        nav: { localeNames: messages.nav.localeNames },
        common: { actions: messages.common.actions },
      }}
    >
      <div className="page-container grid flex-1 grid-rows-[1fr_auto] gap-6 pt-6 sb:grid-cols-[12rem_minmax(0,1fr)] sb:grid-rows-1 sb:gap-10 sb:py-10">
        <main id="admin-main" className="min-w-0 pb-6 sb:col-start-2 sb:row-start-1 sb:pb-0">
          {children}
        </main>
        <nav
          aria-label={t("nav")}
          className="sticky bottom-0 z-30 -mx-(--page-gutter) border-t-2 border-primary bg-background pb-[env(safe-area-inset-bottom)] sb:top-24 sb:col-start-1 sb:row-start-1 sb:mx-0 sb:self-start sb:border-t-0 sb:border-r-2 sb:pr-4 sb:pb-0"
        >
          <p className="hidden px-3 pb-3 font-sans text-xs font-semibold tracking-[0.2em] uppercase sb:block">
            {t("title")}
          </p>
          <ul className="grid grid-cols-5 sb:grid-cols-1 sb:gap-1">
            <li>
              <AdminNavLink entry="products" label={t("products")} />
            </li>
            <li>
              <AdminNavLink entry="add" label={t("newProduct")} />
            </li>
            <li>
              <AdminNavLink entry="collections" label={t("collections")} />
            </li>
            <li>
              <AdminNavLink entry="attributes" label={t("attributes")} />
            </li>
            <li>
              <AdminNavLink entry="shop" label={t("viewShop")} />
            </li>
          </ul>
        </nav>
      </div>
    </NextIntlClientProvider>
  );
}
