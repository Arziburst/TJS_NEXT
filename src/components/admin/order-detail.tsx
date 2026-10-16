import { AtSignIcon, InfoIcon, MailIcon, MessageCircleIcon, PhoneIcon, SendIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { addOrderNote, changeOrderStatus } from "@/app/[locale]/admin/orders/actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { contactLinks, type ContactKind } from "@/lib/admin/contact-links";
import type { AdminOrder, DeliveryDestination } from "@/lib/admin/orders";
import { decimalString, formatMoney, type Money } from "@/lib/money/format";
import { cn } from "@/lib/utils";
import { countryName, customerName, formatOrderTime } from "./order-format";
import { OrderNoteForm } from "./order-note-form";
import { OrderStatusActions } from "./order-status-actions";
import { OrderStatusBadge } from "./order-status-badge";
import { editProductHref } from "./paths";

const CONTACT_ICONS: Record<ContactKind, typeof PhoneIcon> = {
  phone: PhoneIcon,
  email: MailIcon,
  instagram: AtSignIcon,
  telegram: SendIcon,
  viber: MessageCircleIcon,
  whatsapp: MessageCircleIcon,
};

function Amount({ money, locale, className }: { money: Money; locale: string; className?: string }) {
  return (
    <data value={decimalString(money)} data-currency={money.currency} className={cn("tabular-nums", className)}>
      {formatMoney(money, locale)}
    </data>
  );
}

function Section({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} data-testid={id} className={cn("grid content-start gap-3 border-2 border-hairline p-3 sb:p-4", className)}>
      <h2 id={id} className="font-sans text-base font-semibold tracking-[0.2em] uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sb:grid-cols-[10rem_minmax(0,1fr)] sb:gap-3">
      <dt className="font-sans text-sm font-semibold">{label}</dt>
      <dd className="min-w-0 font-input break-words">{children}</dd>
    </div>
  );
}

function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

async function DestinationRows({ destination }: { destination: DeliveryDestination }) {
  const t = await getTranslations("admin.orders.destination");
  switch (destination.kind) {
    case "novaPoshtaWarehouse":
      return (
        <>
          <Row label={t("city")}>{destination.city}</Row>
          <Row label={t(destination.postomat ? "postomat" : "warehouse")}>{destination.warehouse}</Row>
        </>
      );
    case "novaPoshtaAddress":
      return (
        <>
          <Row label={t("city")}>{destination.city}</Row>
          <Row label={t("address")}>
            {t("street", { street: destination.street, house: destination.house })}
            {destination.flat && <span className="block">{t("flat", { flat: destination.flat })}</span>}
          </Row>
        </>
      );
    case "novaPostDivision":
      return (
        <>
          <Row label={t("city")}>{destination.settlement}</Row>
          <Row label={t("division")}>
            {destination.division}
            {destination.address && <span className="block text-sm">{destination.address}</span>}
          </Row>
        </>
      );
    case "novaPostAddress":
      return (
        <>
          <Row label={t("city")}>{t("postCity", { postCode: destination.postCode, city: destination.city })}</Row>
          <Row label={t("address")}>
            {t("street", { street: destination.street, house: destination.building })}
            {destination.flat && <span className="block">{t("flat", { flat: destination.flat })}</span>}
          </Row>
        </>
      );
    case "other":
      return (
        <Row label={t("raw")}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
            {destination.values.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="font-sans text-sm">{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Row>
      );
  }
}

/*
 * One order for the admin: the quick status buttons and the customer's contacts first (a phone screen starts
 * with what the owner does next), then the lines as ordered, the delivery, the internal notes and the history.
 */
export async function OrderDetail({ order, locale }: { order: AdminOrder; locale: string }) {
  const [t, tStatus, tCheckout, tFulfillment, tAvailability] = await Promise.all([
    getTranslations("admin.orders"),
    getTranslations("admin.orderStatus"),
    getTranslations("checkout"),
    getTranslations("admin.fulfillment"),
    getTranslations("admin.availability"),
  ]);
  const money = (amountMinor: number): Money => ({ currency: order.currency, amountMinor, decimals: order.decimals });
  const usd = (amountMinor: number): Money => ({ currency: "USD", amountMinor, decimals: 2 });
  const name = customerName(order.firstName, order.lastName);
  const contacts = contactLinks({ phone: order.phone, email: order.email });
  const markup = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(order.markupBps / 10_000);
  const { delivery } = order;

  return (
    <div className="grid gap-5" data-testid="order-detail" data-number={order.number}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-xl font-bold tracking-[0.2em] uppercase tabular-nums sb:text-2xl">
          {t("detail.title", { number: order.number })}
        </h1>
        <OrderStatusBadge status={order.status} label={tStatus(order.status)} className="h-7 px-3 text-sm" />
        <p className="w-full font-input text-sm">{t("detail.placed", { date: formatOrderTime(order.createdAt, locale) })}</p>
      </header>

      <div className="grid gap-5 sb:grid-cols-2 sb:items-start">
        <Section id="order-status-section" title={t("detail.status")}>
          <OrderStatusActions number={order.number} status={order.status} changeOrderStatus={changeOrderStatus} />
        </Section>

        <Section id="order-customer" title={t("detail.customer")}>
          <ul className="flex flex-wrap gap-2" aria-label={t("detail.contact")}>
            {contacts.map((link) => {
              const Icon = CONTACT_ICONS[link.kind];
              const external = link.href.startsWith("https:");
              return (
                <li key={link.kind}>
                  <a
                    href={link.href}
                    data-contact={link.kind}
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className={cn(buttonVariants({ variant: "outline" }), "min-h-12 px-3")}
                  >
                    <Icon aria-hidden />
                    {t(`detail.contactAction.${link.kind}`)}
                  </a>
                </li>
              );
            })}
          </ul>
          <dl className="grid gap-2">
            <Row label={t("detail.name")}>{name}</Row>
            <Row label={t("detail.phone")}>
              <a href={`tel:${order.phone}`} className="underline underline-offset-4 hover:text-accent-text">
                {order.phone}
              </a>
            </Row>
            <Row label={t("detail.email")}>
              <a href={`mailto:${order.email}`} className="break-all underline underline-offset-4 hover:text-accent-text">
                {order.email}
              </a>
            </Row>
            <Row label={t("detail.account")}>{t(order.userId ? "detail.registered" : "detail.guest")}</Row>
            <Row label={t("detail.language")}>{languageName(order.locale, locale)}</Row>
            <Row label={t("detail.comment")}>
              {order.comment ? <span className="whitespace-pre-wrap">{order.comment}</span> : t("detail.noComment")}
            </Row>
          </dl>
        </Section>

        <Section id="order-lines" title={t("detail.lines")} className="sb:col-span-2">
          <ul className="flex flex-col divide-y divide-hairline border-y border-hairline">
            {order.lines.map((line) => (
              <li
                key={line.position}
                className="flex flex-col gap-2 py-3 sb:flex-row sb:items-start sb:justify-between sb:gap-4"
                data-testid="order-line"
              >
                <div className="grid min-w-0 gap-1">
                  <p lang={line.titleLocale !== locale ? line.titleLocale : undefined} className="font-sans font-semibold break-words">
                    {line.productId ? (
                      <Link href={editProductHref(line.productId)} className="underline-offset-4 hover:text-accent-text hover:underline">
                        {line.title}
                      </Link>
                    ) : (
                      line.title
                    )}
                  </p>
                  <p className="flex flex-wrap items-center gap-2 font-input text-sm">
                    {line.sku && <span>{t("detail.sku", { sku: line.sku })}</span>}
                    <Badge variant="outline" className="rounded-none">
                      {tFulfillment(line.fulfillment)}
                    </Badge>
                    {line.fulfillment === "one_of_a_kind" && line.availability && (
                      <Badge variant="secondary" className="rounded-none" data-testid="line-availability">
                        {tAvailability(line.availability)}
                      </Badge>
                    )}
                    {!line.productId && <span>{t("detail.productGone")}</span>}
                  </p>
                </div>
                <div className="grid shrink-0 gap-0.5 font-input text-sm sb:text-right">
                  <p>{t("detail.quantity", { quantity: line.quantity, price: formatMoney(money(line.unitMinor), locale) })}</p>
                  <p className="font-sans text-base font-semibold text-accent-text">
                    <Amount money={money(line.lineMinor)} locale={locale} />
                  </p>
                  <p>
                    <Amount money={usd(line.lineUsdMinor)} locale={locale} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <dl className="grid gap-2">
            <div className="flex items-baseline justify-between gap-4 border-t-2 border-primary pt-3" data-testid="order-total">
              <dt>{t("detail.goodsTotal")}</dt>
              <dd className="font-sans text-xl text-accent-text">
                <Amount money={money(order.totalMinor)} locale={locale} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 font-input text-sm">
              <dt>{t("detail.usdTotal")}</dt>
              <dd>
                <Amount money={usd(order.totalUsdMinor)} locale={locale} />
              </dd>
            </div>
            {order.currency !== "USD" && (
              <p className="font-input text-sm">
                {t("detail.rate", { rate: order.fxRate, date: order.fxRateDate ?? "", markup })}
              </p>
            )}
          </dl>
        </Section>

        <Section id="order-delivery" title={t("detail.delivery")}>
          <dl className="grid gap-2">
            <Row label={t("detail.country")}>{countryName(order.country, locale)}</Row>
            <Row label={t("detail.carrier")}>{t(`carrier.${order.carrier}`)}</Row>
            <Row label={t("detail.method")}>{t(`method.${order.method}`)}</Row>
            <DestinationRows destination={order.destination} />
            <Row label={t("detail.estimate")}>
              <span data-testid="order-delivery-estimate">
                {delivery.state === "amount" ? (
                  <>
                    <span aria-hidden>{tCheckout("internationalDelivery.quote.approx")}</span>
                    <Amount
                      money={{ currency: delivery.currency, amountMinor: delivery.amountMinor, decimals: delivery.decimals }}
                      locale={locale}
                    />
                  </>
                ) : delivery.state === "tbd" ? (
                  tCheckout("done.deliveryTbd")
                ) : (
                  tCheckout("done.deliveryUnavailable")
                )}
              </span>
            </Row>
          </dl>
          <p className="flex items-start gap-2 font-input text-sm">
            <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            {tCheckout("done.deliveryNote")}
          </p>
        </Section>

        <Section id="order-notes" title={t("detail.notes")}>
          <p className="font-input text-sm">{t("detail.notesHint")}</p>
          {order.notes.length === 0 ? (
            <p className="font-input text-sm">{t("detail.noNotes")}</p>
          ) : (
            <ol className="grid gap-3">
              {order.notes.map((note) => (
                <li key={note.id} className="grid gap-1 border-l-2 border-accent pl-3" data-testid="order-note">
                  <p className="font-input whitespace-pre-wrap break-words">{note.body}</p>
                  <p className="font-sans text-xs">
                    {t("detail.noteBy", {
                      author: note.author ?? t("detail.unknownAuthor"),
                      date: formatOrderTime(note.createdAt, locale),
                    })}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <OrderNoteForm number={order.number} addOrderNote={addOrderNote} />
        </Section>

        <Section id="order-history" title={t("detail.history")}>
          <ol className="grid gap-2 font-input text-sm">
            <li className="grid gap-0.5" data-testid="order-history-entry">
              <span className="font-sans font-semibold">{t("detail.historyPlaced")}</span>
              <span>{formatOrderTime(order.createdAt, locale)}</span>
            </li>
            {order.history.map((change) => (
              <li key={change.id} className="grid gap-0.5" data-testid="order-history-entry">
                <span className="font-sans font-semibold">
                  {t("detail.historyChange", { from: tStatus(change.from), to: tStatus(change.to) })}
                </span>
                <span>
                  {change.by
                    ? t("detail.historyBy", { date: formatOrderTime(change.createdAt, locale), name: change.by })
                    : formatOrderTime(change.createdAt, locale)}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}
