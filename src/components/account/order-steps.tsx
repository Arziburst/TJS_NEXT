import { getTranslations } from "next-intl/server";
import type { OrderStepsResult } from "@/lib/account/orders";
import { STATUS_KEYS } from "./order-status";
import { orderDateTime } from "./order-time";

/**
 * How the customer's order moved (#108): its placement, then each status it reached, oldest first, each with
 * its date and time on the shop's (Kyiv) clock. Only the status and its time: the shop's notes and who changed it
 * stay in the admin.
 */
export async function OrderSteps({ read, locale }: { read: OrderStepsResult; locale: string }) {
  const [t, tStatus] = await Promise.all([getTranslations("account.order"), getTranslations("account.orderStatus")]);
  return (
    <section aria-labelledby="order-history-title" className="grid gap-4" data-testid="order-steps">
      <h3 id="order-history-title" className="font-sans text-sm font-semibold tracking-[0.2em] uppercase">
        {t("history")}
      </h3>
      {read.ok ? (
        <ol className="grid gap-4 border-l-2 border-hairline pl-5">
          {read.steps.map((step, index) => (
            <li key={`${step.at}-${index}`} className="relative grid gap-0.5" data-testid="order-step" data-status={step.status}>
              <span aria-hidden className="absolute top-1.5 -left-[calc(1.25rem+5px)] size-2 bg-primary" />
              <span className="font-sans font-semibold">{tStatus(STATUS_KEYS[step.status])}</span>
              <time dateTime={step.at} className="font-input text-sm tabular-nums">
                {orderDateTime(step.at, locale)}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p role="alert">{t("historyError")}</p>
      )}
    </section>
  );
}
