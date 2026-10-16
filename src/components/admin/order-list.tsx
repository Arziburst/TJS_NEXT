import { ChevronRightIcon, PhoneIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AdminOrderListItem } from "@/lib/admin/orders";
import { decimalString, formatMoney, type Money } from "@/lib/money/format";
import { cn } from "@/lib/utils";
import { countryName, customerName, formatOrderTime } from "./order-format";
import { OrderStatusBadge } from "./order-status-badge";
import { adminOrderHref } from "./paths";

function Total({ item, locale, className }: { item: AdminOrderListItem; locale: string; className?: string }) {
  const money: Money = { currency: item.currency, amountMinor: item.totalMinor, decimals: item.decimals };
  return (
    <data value={decimalString(money)} data-currency={money.currency} className={cn("tabular-nums", className)}>
      {formatMoney(money, locale)}
    </data>
  );
}

/*
 * The order list: one card per order on a phone (the customer, a call in one tap, the status and total), a
 * table from `sb` on. Both come from the same rows; CSS shows one of them.
 */
export async function OrderList({ items, locale }: { items: AdminOrderListItem[]; locale: string }) {
  const [t, tStatus] = await Promise.all([getTranslations("admin.orders"), getTranslations("admin.orderStatus")]);

  return (
    <>
      <ul className="grid gap-3 sb:hidden" data-testid="order-cards">
        {items.map((item) => {
          const name = customerName(item.firstName, item.lastName);
          return (
            <li key={item.number} data-testid="order-card" data-number={item.number} className="relative border-2 border-hairline p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="grid min-w-0 gap-1">
                  {/* the whole card opens the order; the call link sits above it */}
                  <Link
                    href={adminOrderHref(item.number)}
                    className="font-sans text-lg font-bold tabular-nums outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:outline-ring"
                    aria-label={t("open", { number: item.number, name })}
                  >
                    {t("number", { number: item.number })}
                  </Link>
                  <p className="truncate font-sans font-semibold">{name}</p>
                  <p className="font-input text-sm">{formatOrderTime(item.createdAt, locale)}</p>
                </div>
                <OrderStatusBadge status={item.status} label={tStatus(item.status)} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="flex flex-wrap items-baseline gap-x-4 font-input text-sm">
                  <span>{countryName(item.country, locale)}</span>
                  <span>{t("pieces", { count: item.quantity })}</span>
                  <Total item={item} locale={locale} className="font-sans font-semibold text-accent-text" />
                </p>
                <a
                  href={`tel:${item.phone}`}
                  aria-label={t("call", { name })}
                  className="relative z-10 flex size-11 shrink-0 items-center justify-center border-2 border-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <PhoneIcon aria-hidden className="size-5" />
                </a>
              </div>
            </li>
          );
        })}
      </ul>

      <table className="hidden w-full border-collapse font-input text-sm sb:table" data-testid="order-table">
        <thead>
          <tr className="border-b-2 border-primary text-left font-sans font-semibold">
            <th scope="col" className="py-2 pr-3">
              {t("columns.number")}
            </th>
            <th scope="col" className="py-2 pr-3">
              {t("columns.date")}
            </th>
            <th scope="col" className="py-2 pr-3">
              {t("columns.customer")}
            </th>
            <th scope="col" className="py-2 pr-3">
              {t("columns.country")}
            </th>
            <th scope="col" className="py-2 pr-3 text-right">
              {t("columns.total")}
            </th>
            <th scope="col" className="py-2 pr-3">
              {t("columns.status")}
            </th>
            <th scope="col" className="py-2">
              <span className="sr-only">{t("columns.open")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const name = customerName(item.firstName, item.lastName);
            return (
              <tr key={item.number} data-testid="order-row" data-number={item.number} className="border-b border-hairline align-top">
                <td className="py-3 pr-3 font-sans font-bold tabular-nums">
                  <Link href={adminOrderHref(item.number)} className="underline-offset-4 hover:underline">
                    {t("number", { number: item.number })}
                  </Link>
                </td>
                <td className="py-3 pr-3 whitespace-nowrap">{formatOrderTime(item.createdAt, locale)}</td>
                <td className="py-3 pr-3">
                  <p className="font-sans font-semibold">{name}</p>
                  <p className="flex flex-wrap gap-x-3">
                    <a href={`tel:${item.phone}`} className="underline-offset-4 hover:underline">
                      {item.phone}
                    </a>
                    <a href={`mailto:${item.email}`} className="break-all underline-offset-4 hover:underline">
                      {item.email}
                    </a>
                  </p>
                </td>
                <td className="py-3 pr-3">{countryName(item.country, locale)}</td>
                <td className="py-3 pr-3 text-right whitespace-nowrap">
                  <Total item={item} locale={locale} className="font-sans font-semibold text-accent-text" />
                  <p>{t("pieces", { count: item.quantity })}</p>
                </td>
                <td className="py-3 pr-3">
                  <OrderStatusBadge status={item.status} label={tStatus(item.status)} />
                </td>
                <td className="py-3">
                  <Link
                    href={adminOrderHref(item.number)}
                    aria-label={t("open", { number: item.number, name })}
                    className="flex size-9 items-center justify-center outline-none hover:text-accent-text focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <ChevronRightIcon aria-hidden className="size-5" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
