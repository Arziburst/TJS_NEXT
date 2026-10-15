import { InfoIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { SHOP_HREF } from "@/components/catalog/links";
import { ShopContactLinks } from "@/components/layout/footer-contacts";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { parseOrderNumber, readOrderForVisitor } from "@/lib/checkout/confirmation";
import { decimalString, formatMoney, type Money } from "@/lib/money/format";
import type { OrderView } from "@/lib/orders/store";
import { cn } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Amount({ money, locale, className }: { money: Money; locale: string; className?: string }) {
  return (
    <data value={decimalString(money)} data-currency={money.currency} data-slot="price" className={cn("tabular-nums", className)}>
      {formatMoney(money, locale)}
    </data>
  );
}

/*
 * The confirmation of an order request: its number, the lines and totals as they were stored (never priced
 * again), the delivery estimate and what happens next. Shown only to the visitor who placed the order; anyone
 * else sees that it cannot be shown. Request-time data: render inside <Suspense>.
 */
export async function OrderConfirmation({ searchParams }: { searchParams: SearchParams }) {
  const [{ order: param }, t, locale] = await Promise.all([searchParams, getTranslations("checkout"), getLocale()]);
  const number = parseOrderNumber(param);
  const read = number === null ? { ok: true as const, order: null } : await readOrderForVisitor(number);

  if (!read.ok) {
    return (
      <p role="alert" className="py-10">
        {t("request.loadError")}
      </p>
    );
  }
  if (!read.order) {
    return (
      <div className="flex flex-col items-start gap-4 py-6" data-testid="order-not-available">
        <h1 className="font-display text-4xl uppercase sb:text-5xl">{t("done.title")}</h1>
        <p className="text-lg">{t("done.notAvailable")}</p>
        <p>{t("done.notAvailableHint")}</p>
        <Link href={SHOP_HREF} className={cn(buttonVariants())}>
          {t("payment.continueShopping")}
        </Link>
      </div>
    );
  }
  return <ConfirmedOrder order={read.order} locale={locale} />;
}

async function ConfirmedOrder({ order, locale }: { order: OrderView; locale: string }) {
  const t = await getTranslations("checkout");
  const money = (amountMinor: number): Money => ({ currency: order.currency, amountMinor, decimals: order.decimals });
  const { delivery } = order;

  return (
    <div className="flex flex-col gap-8" data-testid="order-confirmation">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl uppercase sb:text-5xl">{t("done.title")}</h1>
        <p className="text-lg">{t("done.thanks", { name: order.firstName })}</p>
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span>{t("done.number")}</span>
          <strong className="font-sans text-3xl tabular-nums" data-testid="order-number">
            {order.number}
          </strong>
        </p>
      </div>

      <div className="grid gap-10 sb:grid-cols-[minmax(0,1fr)_22rem] sb:items-start sb:gap-14">
        <section aria-labelledby="order-lines-title" className="flex flex-col gap-5">
          <h2 id="order-lines-title" className="font-sans text-base font-semibold tracking-[0.2em] uppercase">
            {t("done.lines")}
          </h2>
          <ul className="flex flex-col divide-y divide-hairline border-y border-hairline">
            {order.lines.map((line) => (
              <li key={line.position} className="flex items-baseline justify-between gap-4 py-3" data-testid="order-line">
                <span className="flex min-w-0 flex-col gap-1">
                  <span lang={line.titleLocale !== locale ? line.titleLocale : undefined} className="font-sans font-semibold break-words">
                    {line.title}
                  </span>
                  <span className="text-sm">{t("done.quantity", { quantity: line.quantity })}</span>
                </span>
                <Amount money={money(line.lineMinor)} locale={locale} className="shrink-0 font-sans text-accent-text" />
              </li>
            ))}
          </ul>
          <dl className="grid gap-3">
            <div className="flex items-baseline justify-between gap-4 border-t-2 border-primary pt-4" data-testid="order-total">
              <dt>{t("done.goodsTotal")}</dt>
              <dd className="font-sans text-xl text-accent-text">
                <Amount money={money(order.totalMinor)} locale={locale} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4" data-testid="order-delivery">
              <dt>{t("done.delivery")}</dt>
              <dd className="font-sans">
                {delivery.state === "amount" ? (
                  <>
                    <span aria-hidden>{t("internationalDelivery.quote.approx")}</span>
                    <Amount
                      money={{ currency: delivery.currency, amountMinor: delivery.amountMinor, decimals: delivery.decimals }}
                      locale={locale}
                    />
                  </>
                ) : delivery.state === "tbd" ? (
                  <span data-slot="price-tbd">{t("done.deliveryTbd")}</span>
                ) : (
                  t("done.deliveryUnavailable")
                )}
              </dd>
            </div>
          </dl>
          <p className="text-sm">{t("done.deliveryNote")}</p>
          {order.carrier === "nova_post" ? (
            <p className="flex items-start gap-2 text-sm">
              <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t("internationalDelivery.customsNotice")}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="order-next-title" className="flex flex-col gap-4">
          <h2 id="order-next-title" className="font-sans text-base font-semibold tracking-[0.2em] uppercase">
            {t("done.contactTitle")}
          </h2>
          <p>{t("done.next")}</p>
          {/* the shop's channels from the admin settings (#21); a visible TBD while none is set */}
          <div data-testid="contact-channels" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-accent-text">
            <ShopContactLinks fallback={t("done.contactTbd")} />
          </div>
          <Link href={SHOP_HREF} className={cn(buttonVariants(), "self-start")}>
            {t("payment.continueShopping")}
          </Link>
        </section>
      </div>
    </div>
  );
}
