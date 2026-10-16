import { ArrowLeftIcon, InfoIcon } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccountFrame, AccountSkeleton, SectionTitle } from "@/components/account/account-frame";
import { DeliverySummary } from "@/components/account/delivery-summary";
import { OrderStatusBadge, orderDate } from "@/components/account/order-status";
import { ACCOUNT_ORDERS_HREF, accountOrderHref } from "@/components/account/paths";
import { Link } from "@/i18n/navigation";
import { readOwnOrderDetail } from "@/lib/account/orders";
import { requireUser } from "@/lib/auth/session";
import { parseOrderNumber } from "@/lib/checkout/confirmation";
import { decimalString, formatMoney, type Money } from "@/lib/money/format";
import { createSessionClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

// No order is known at build time; a number no order has (order numbers start at 10001) lets the build
// prerender the route's shell (the shared header reads the pathname), every real number renders at request
// time behind the user check.
const UNKNOWN_NUMBER = "0";

export function generateStaticParams() {
  return [{ number: UNKNOWN_NUMBER }];
}

export async function generateMetadata({ params }: PageProps<"/[locale]/account/orders/[number]">): Promise<Metadata> {
  const [{ number }, t] = await Promise.all([params, getTranslations("account.order")]);
  const parsed = parseOrderNumber(number);
  return { title: parsed === null ? t("notFound.title") : t("title", { number: parsed }) };
}

function Amount({ money, locale, className }: { money: Money; locale: string; className?: string }) {
  return (
    <data value={decimalString(money)} data-currency={money.currency} data-slot="price" className={cn("tabular-nums", className)}>
      {formatMoney(money, locale)}
    </data>
  );
}

/*
 * One order of the customer: its status, the lines and totals as they were stored when it was sent (never
 * priced again), the delivery and the contacts. The read goes through the customer's session (RLS): another
 * customer's number, or an unknown one, shows "not found" in the account.
 */
export default function AccountOrderPage({ params }: PageProps<"/[locale]/account/orders/[number]">) {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <OrderContents params={params} />
    </Suspense>
  );
}

async function OrderContents({ params }: Pick<PageProps<"/[locale]/account/orders/[number]">, "params">) {
  const [locale, { number: param }] = await Promise.all([getLocale(), params]);
  const number = parseOrderNumber(param);
  const user = await requireUser(locale, `/${locale}${number === null ? ACCOUNT_ORDERS_HREF : accountOrderHref(number)}`);
  const t = await getTranslations("account");
  const read = number === null ? { ok: true as const, order: null } : await readOwnOrderDetail(await createSessionClient(), user.id, number);

  const back = (
    <Link href={ACCOUNT_ORDERS_HREF} className="inline-flex min-h-11 w-fit items-center gap-2 text-sm underline underline-offset-4 hover:text-accent-text">
      <ArrowLeftIcon aria-hidden className="size-4" />
      {t("order.back")}
    </Link>
  );

  if (!read.ok) {
    return (
      <AccountFrame current="orders">
        {back}
        <p role="alert">{t("loadError")}</p>
      </AccountFrame>
    );
  }
  const { order } = read;
  if (!order) {
    return (
      <AccountFrame current="orders">
        {back}
        <section className="grid gap-3" data-testid="order-not-found">
          <SectionTitle>{t("order.notFound.title")}</SectionTitle>
          <p>{t("order.notFound.text")}</p>
        </section>
      </AccountFrame>
    );
  }

  const money = (amountMinor: number): Money => ({ currency: order.currency, amountMinor, decimals: order.decimals });
  const { estimate } = order;
  const contactName = [order.firstName, order.lastName].filter(Boolean).join(" ");

  return (
    <AccountFrame current="orders">
      {back}
      <div className="grid gap-3" data-testid="order-detail">
        <SectionTitle>{t("order.title", { number: order.number })}</SectionTitle>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <time dateTime={order.createdAt}>{t("order.placed", { date: orderDate(order.createdAt, locale) })}</time>
          <span className="flex items-center gap-2">
            <span className="sr-only">{t("order.status")}</span>
            <OrderStatusBadge status={order.status} />
          </span>
        </div>
      </div>

      <section aria-labelledby="order-lines-title" className="grid gap-4">
        <h3 id="order-lines-title" className="font-sans text-sm font-semibold tracking-[0.2em] uppercase">
          {t("order.lines")}
        </h3>
        <ul className="flex flex-col divide-y divide-hairline border-y border-hairline">
          {order.lines.map((line) => (
            <li key={line.position} className="flex items-baseline justify-between gap-4 py-3" data-testid="order-detail-line">
              <span className="flex min-w-0 flex-col gap-1">
                <span lang={line.titleLocale !== locale ? line.titleLocale : undefined} className="font-sans font-semibold break-words">
                  {line.title}
                </span>
                <span className="text-sm">{t("order.quantity", { quantity: line.quantity })}</span>
              </span>
              <Amount money={money(line.lineMinor)} locale={locale} className="shrink-0 font-sans text-accent-text" />
            </li>
          ))}
        </ul>
        <dl className="grid gap-3">
          <div className="flex items-baseline justify-between gap-4" data-testid="order-detail-total">
            <dt>
              {t("order.goodsTotal")}
              <span className="block text-sm">{t("orders.pieces", { count: order.itemCount })}</span>
            </dt>
            <dd className="font-sans text-xl text-accent-text">
              <Amount money={money(order.totalMinor)} locale={locale} />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt>{t("order.estimate")}</dt>
            <dd className="font-sans">
              {estimate.state === "amount" ? (
                <Amount money={{ currency: estimate.currency, amountMinor: estimate.amountMinor, decimals: estimate.decimals }} locale={locale} />
              ) : estimate.state === "tbd" ? (
                <span data-slot="price-tbd">{t("order.estimateTbd")}</span>
              ) : (
                t("order.estimateUnavailable")
              )}
            </dd>
          </div>
        </dl>
        <p className="flex items-start gap-2 text-sm">
          <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("order.deliveryNote")}
        </p>
      </section>

      <div className="grid gap-8 border-t-2 border-hairline pt-8 sm:grid-cols-2">
        <section aria-labelledby="order-delivery-title" className="grid content-start gap-3">
          <h3 id="order-delivery-title" className="font-sans text-sm font-semibold tracking-[0.2em] uppercase">
            {t("order.delivery")}
          </h3>
          {order.delivery ? <DeliverySummary choice={order.delivery} /> : <p>{order.country}</p>}
        </section>
        <section aria-labelledby="order-contact-title" className="grid content-start gap-3">
          <h3 id="order-contact-title" className="font-sans text-sm font-semibold tracking-[0.2em] uppercase">
            {t("order.contact")}
          </h3>
          <p className="grid gap-0.5 break-words">
            <span>{contactName}</span>
            <span className="font-input text-sm">{order.phone}</span>
            <span className="font-input text-sm break-all">{order.email}</span>
          </p>
          {order.comment ? (
            <div className="grid gap-1">
              <h4 className="font-sans text-sm font-semibold">{t("order.comment")}</h4>
              <p className="text-sm break-words whitespace-pre-line">{order.comment}</p>
            </div>
          ) : null}
        </section>
      </div>
    </AccountFrame>
  );
}
