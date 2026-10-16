import { getTranslations } from "next-intl/server";
import type { OrderStatus } from "@/lib/account/orders";
import { BUSINESS_TIME_ZONE } from "@/lib/money/business-date";
import { cn } from "@/lib/utils";

// D17: the order statuses, as `account.orderStatus.<key>` names them
const STATUS_KEYS = {
  new: "new",
  pending_payment: "pendingPayment",
  paid: "paid",
  in_processing: "inProcessing",
  accepted: "accepted",
  closed: "closed",
  canceled: "canceled",
  refunded: "refunded",
} as const satisfies Record<OrderStatus, string>;

/** An order's status in the visitor's language. */
export async function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const t = await getTranslations("account.orderStatus");
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex w-fit items-center border-2 px-2 py-0.5 font-sans text-xs font-semibold tracking-wider uppercase",
        status === "canceled" || status === "refunded" ? "border-hairline" : "border-primary",
        className,
      )}
    >
      {t(STATUS_KEYS[status])}
    </span>
  );
}

/** An order's date in the visitor's language, on the shop's (Kyiv) calendar. */
export function orderDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: BUSINESS_TIME_ZONE }).format(new Date(iso));
}
