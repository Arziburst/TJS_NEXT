import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminPending, AdminShell } from "@/components/admin/admin-shell";
import { countryName } from "@/components/admin/order-format";
import { OrderList } from "@/components/admin/order-list";
import { ADMIN_ORDERS_HREF } from "@/components/admin/paths";
import { inputClass, labelClass, selectClass } from "@/components/admin/styles";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  hasOrderFilters,
  ORDER_COUNTRIES,
  ORDER_SEARCH_MAX_LENGTH,
  orderFilterParams,
  parseOrderFilters,
} from "@/lib/admin/order-filters";
import { ADMIN_ORDER_STATUSES } from "@/lib/admin/order-status";
import { listAdminOrders } from "@/lib/admin/orders";
import { getAdmin, requireAdmin } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  // nothing about the admin area for anyone else, not even its title
  if (!(await getAdmin())) return {};
  const t = await getTranslations("admin.orders");
  return { title: t("title") };
}

export default function AdminOrdersPage(props: PageProps<"/[locale]/admin/orders">) {
  return (
    <Suspense fallback={<AdminPending />}>
      <AdminOrders {...props} />
    </Suspense>
  );
}

/*
 * The owner's dashboard of order requests: new requests first (their count on top), then every other order
 * newest on top; filters by status, Kyiv dates and country, and a search by number, name, phone or email.
 */
async function AdminOrders({ params, searchParams }: PageProps<"/[locale]/admin/orders">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireAdmin(locale, `/${locale}${ADMIN_ORDERS_HREF}`);

  const { filters, page } = parseOrderFilters(await searchParams);
  const [t, tStatus, orders] = await Promise.all([
    getTranslations("admin.orders"),
    getTranslations("admin.orderStatus"),
    listAdminOrders(filters, page),
  ]);
  const filtered = hasOrderFilters(filters);
  const countries = ORDER_COUNTRIES.map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) =>
    // Ukraine first, the rest by name
    a.code === "UA" ? -1 : b.code === "UA" ? 1 : a.name.localeCompare(b.name, locale),
  );

  return (
    <AdminShell>
      <div className="grid gap-5">
        <header className="grid gap-1">
          <h1 className="text-xl font-bold tracking-[0.2em] uppercase sb:text-2xl">{t("title")}</h1>
          {orders.ok && (
            <p className="flex flex-wrap gap-x-3 font-input text-sm" role="status">
              <strong className="font-sans text-accent-text" data-testid="new-orders-count">
                {t("newCount", { count: orders.data.newCount })}
              </strong>
              <span>{t("count", { count: orders.data.total })}</span>
            </p>
          )}
        </header>

        <search>
          <form
            method="get"
            className="grid gap-3 border-2 border-hairline p-3 sb:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] sb:items-end"
          >
            <div className="grid gap-1.5">
              <label htmlFor="orders-search" className={labelClass}>
                {t("searchLabel")}
              </label>
              <input
                id="orders-search"
                name="q"
                type="search"
                defaultValue={filters.query}
                placeholder={t("searchPlaceholder")}
                maxLength={ORDER_SEARCH_MAX_LENGTH}
                enterKeyHint="search"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sb:contents">
              <div className="grid gap-1.5">
                <label htmlFor="orders-status" className={labelClass}>
                  {t("status")}
                </label>
                <select id="orders-status" name="status" defaultValue={filters.status ?? ""} className={selectClass}>
                  <option value="">{t("allStatuses")}</option>
                  {ADMIN_ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {tStatus(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="orders-country" className={labelClass}>
                  {t("country")}
                </label>
                <select id="orders-country" name="country" defaultValue={filters.country ?? ""} className={selectClass}>
                  <option value="">{t("allCountries")}</option>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="orders-from" className={labelClass}>
                  {t("dateFrom")}
                </label>
                <input id="orders-from" name="from" type="date" defaultValue={filters.dateFrom} className={inputClass} />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="orders-to" className={labelClass}>
                  {t("dateTo")}
                </label>
                <input id="orders-to" name="to" type="date" defaultValue={filters.dateTo} className={inputClass} />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className={cn(buttonVariants({ className: "flex-1 sb:flex-none" }))}>
                {t("apply")}
              </button>
              {filtered && (
                <Link href={ADMIN_ORDERS_HREF} className={cn(buttonVariants({ variant: "outline", className: "flex-1 sb:flex-none" }))}>
                  {t("reset")}
                </Link>
              )}
            </div>
          </form>
        </search>

        {!orders.ok ? (
          <p role="alert" className="border-2 border-destructive p-3 font-input text-sm">
            {t("loadError")}
          </p>
        ) : orders.data.total === 0 ? (
          <p className="font-input text-sm">{filtered ? t("noMatch") : t("empty")}</p>
        ) : (
          <>
            <OrderList items={orders.data.items} locale={locale} />
            <AdminPagination
              page={orders.data.page}
              pageCount={orders.data.pageCount}
              search={orderFilterParams(filters)}
              path={ADMIN_ORDERS_HREF}
            />
          </>
        )}
      </div>
    </AdminShell>
  );
}
