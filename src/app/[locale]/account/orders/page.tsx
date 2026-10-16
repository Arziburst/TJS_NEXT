import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccountFrame, AccountSkeleton, SectionTitle } from "@/components/account/account-frame";
import { OrderStatusBadge, orderDate } from "@/components/account/order-status";
import { ACCOUNT_ORDERS_HREF, accountOrderHref, accountOrdersPageHref } from "@/components/account/paths";
import { SHOP_HREF } from "@/components/catalog/links";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { listOwnOrders } from "@/lib/account/orders";
import { ORDERS_PAGE_SIZE } from "@/lib/account/schemas";
import { requireUser } from "@/lib/auth/session";
import { decimalString, formatMoney } from "@/lib/money/format";
import { createSessionClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.orders");
  return { title: t("title") };
}

// ?page=<n>: positive integers only; anything else is the first page
function pageOf(value: string | string[] | undefined): number {
  return typeof value === "string" && /^[1-9][0-9]{0,5}$/.test(value) ? Number(value) : 1;
}

export default function AccountOrdersPage({ searchParams }: PageProps<"/[locale]/account/orders">) {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <OrdersContents searchParams={searchParams} />
    </Suspense>
  );
}

async function OrdersContents({ searchParams }: Pick<PageProps<"/[locale]/account/orders">, "searchParams">) {
  const locale = await getLocale();
  const user = await requireUser(locale, `/${locale}${ACCOUNT_ORDERS_HREF}`);
  const [t, { page: pageParam }] = await Promise.all([getTranslations("account"), searchParams]);
  const page = pageOf(pageParam);
  const result = await listOwnOrders(await createSessionClient(), user.id, page);

  return (
    <AccountFrame current="orders">
      <section aria-labelledby="orders-title" className="grid gap-5">
        <div className="grid gap-2">
          <SectionTitle id="orders-title">{t("orders.title")}</SectionTitle>
          <p>{t("orders.intro")}</p>
        </div>
        {!result.ok ? (
          <p role="alert">{t("loadError")}</p>
        ) : result.total === 0 ? (
          <div className="flex flex-col items-start gap-5" data-testid="orders-empty">
            <p className="text-lg">{t("orders.empty")}</p>
            <Link href={SHOP_HREF} className={cn(buttonVariants())}>
              {t("orders.toShop")}
            </Link>
          </div>
        ) : (
          <>
            <ul
              className="flex flex-col divide-y divide-hairline border-y border-hairline empty:hidden"
              data-testid="orders-list"
            >
              {result.orders.map((order) => {
                const money = { currency: order.currency, amountMinor: order.totalMinor, decimals: order.decimals };
                return (
                  <li key={order.number} data-testid="order-row">
                    <Link
                      href={accountOrderHref(order.number)}
                      aria-label={t("orders.details", { number: order.number })}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-4 outline-none hover:text-accent-text focus-visible:outline-2 focus-visible:outline-ring sb:grid-cols-[10rem_8rem_minmax(0,1fr)_auto_auto] sb:gap-x-6"
                    >
                      <span className="font-sans text-lg font-semibold tabular-nums" data-testid="order-row-number">
                        {t("orders.number", { number: order.number })}
                      </span>
                      <span className="justify-self-end sb:order-4">
                        <OrderStatusBadge status={order.status} />
                      </span>
                      <time dateTime={order.createdAt} className="text-sm sb:order-2">
                        {orderDate(order.createdAt, locale)}
                      </time>
                      <span className="justify-self-end text-sm sb:order-3 sb:justify-self-start">
                        {t("orders.pieces", { count: order.itemCount })}
                      </span>
                      <data
                        value={decimalString(money)}
                        data-currency={money.currency}
                        className="col-span-2 font-sans text-accent-text tabular-nums sb:order-5 sb:col-span-1 sb:justify-self-end"
                      >
                        {formatMoney(money, locale)}
                      </data>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Pagination page={page} pages={Math.max(1, Math.ceil(result.total / ORDERS_PAGE_SIZE))} />
          </>
        )}
      </section>
    </AccountFrame>
  );
}

async function Pagination({ page, pages }: { page: number; pages: number }) {
  if (pages <= 1 && page === 1) return null;
  const t = await getTranslations("account.orders.pagination");
  const linkClass = cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-11");
  return (
    <nav aria-label={t("label")} className="flex flex-wrap items-center justify-between gap-4">
      {page > 1 ? (
        // past the last page (an old link), "newer" goes back to the last one
        <Link href={accountOrdersPageHref(Math.min(page - 1, pages))} className={linkClass}>
          <ChevronLeftIcon aria-hidden />
          {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      <span className="font-input text-sm">{t("page", { page, pages })}</span>
      {page < pages ? (
        <Link href={accountOrdersPageHref(page + 1)} className={linkClass}>
          {t("next")}
          <ChevronRightIcon aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
