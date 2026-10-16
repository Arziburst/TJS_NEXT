import { HeartIcon, MapPinIcon, PackageIcon, UserIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { routes } from "@/config/routes";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ACCOUNT_ADDRESSES_HREF, ACCOUNT_HREF, ACCOUNT_ORDERS_HREF } from "./paths";

export type AccountSection = "profile" | "orders" | "addresses";

const SECTIONS = [
  { key: "profile", href: ACCOUNT_HREF, icon: UserIcon },
  { key: "orders", href: ACCOUNT_ORDERS_HREF, icon: PackageIcon },
  { key: "addresses", href: ACCOUNT_ADDRESSES_HREF, icon: MapPinIcon },
  { key: "favorites", href: routes.favorites.path, icon: HeartIcon },
] as const;

/*
 * The account's frame: the title and the sections (profile, orders, addresses and the favorites page). Pages
 * render it only after their requireUser check, so a guest never sees it. Mobile first: the sections are a row
 * of tabs that scrolls sideways on a phone and a column beside the content from the `sb` breakpoint on.
 */
export async function AccountFrame({ current, children }: { current: AccountSection; children: ReactNode }) {
  const t = await getTranslations("account");
  return (
    <main className="page-container flex flex-col gap-6 py-6 sb:gap-10 sb:py-10">
      <h1 className="font-display text-4xl uppercase sb:text-5xl">{t("title")}</h1>
      <div className="grid gap-6 sb:grid-cols-[12rem_minmax(0,1fr)] sb:gap-14">
        <nav aria-label={t("sections.label")} className="overflow-x-auto">
          <ul className="flex gap-1 border-b-2 border-hairline sb:flex-col sb:border-b-0 sb:border-l-2">
            {SECTIONS.map(({ key, href, icon: Icon }) => {
              const active = key === current;
              return (
                <li key={key} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "-mb-0.5 flex min-h-11 items-center gap-2 border-b-2 px-3 font-sans text-sm font-semibold whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sb:-ml-0.5 sb:mb-0 sb:border-b-0 sb:border-l-2",
                      active ? "border-accent text-accent-text" : "border-transparent hover:text-accent-text",
                    )}
                  >
                    <Icon aria-hidden className="size-4 shrink-0" />
                    {t(`sections.${key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-col gap-8">{children}</div>
      </div>
    </main>
  );
}

/** The title of an account section. */
export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-sans text-base font-semibold tracking-[0.2em] uppercase">
      {children}
    </h2>
  );
}

/** The placeholder while an account page checks the user and reads its data. */
export function AccountSkeleton() {
  return (
    <div aria-hidden className="page-container flex flex-col gap-6 py-6 sb:gap-10 sb:py-10">
      <span className="h-10 w-64 animate-pulse bg-hairline" />
      <div className="grid gap-6 sb:grid-cols-[12rem_minmax(0,1fr)] sb:gap-14">
        <span className="h-11 animate-pulse bg-hairline sb:h-44" />
        <div className="flex flex-col gap-5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-11 animate-pulse bg-hairline" />
          ))}
        </div>
      </div>
    </div>
  );
}
