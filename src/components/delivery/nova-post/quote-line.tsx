import { useTranslations } from "next-intl";
import type { QuoteView } from "@/lib/delivery/nova-post/actions";
import { cn } from "@/lib/utils";

type QuoteLineProps = {
  // null while nothing is asked yet
  quote: QuoteView | null;
  pending?: boolean;
  failed?: boolean;
  className?: string;
};

/*
 * The delivery line of the order summary: Nova Post's price with its scheduled date, or the zone's flat
 * rate marked as an estimate. An amount the owner has not set shows "TBD", never a made-up number.
 */
export function QuoteLine({ quote, pending = false, failed = false, className }: QuoteLineProps) {
  const t = useTranslations("checkout.internationalDelivery.quote");
  const estimate = quote?.source === "flatRate";

  function value() {
    if (pending) return <span className="text-foreground/70">{t("calculating")}</span>;
    if (failed) return <span>{t("error")}</span>;
    if (!quote) return <span aria-hidden>{t("none")}</span>;
    const { price } = quote;
    if (price.state === "tbd") return <span data-slot="price-tbd">{t("tbd")}</span>;
    if (price.state === "unavailable") return <span>{t("unavailable")}</span>;
    return (
      <data value={price.value} data-currency={price.currency} data-slot="price" className="tabular-nums">
        {estimate ? <span aria-hidden>{t("approx")}</span> : null}
        {price.text}
      </data>
    );
  }

  return (
    <div data-slot="quote-line" data-source={quote?.source} aria-live="polite" className={cn("grid gap-1", className)}>
      <div className="flex items-baseline justify-between gap-4 font-sans">
        <span className="text-sm font-semibold">
          {t("label")}
          {estimate && !pending ? (
            <span data-slot="estimate-mark" className="ml-2 border border-foreground px-1.5 py-0.5 text-xs font-medium uppercase">
              {t("estimate")}
            </span>
          ) : null}
        </span>
        <span className="text-base font-semibold text-accent-text">{value()}</span>
      </div>
      {!pending && quote?.deliveryDate ? (
        <p className="font-input text-sm">{t("deliveryDate", { date: quote.deliveryDate })}</p>
      ) : null}
      {!pending && estimate ? (
        <p className="font-input text-xs text-foreground/80">
          {quote.price.state === "tbd" ? t("tbdNote") : t("estimateNote")}
        </p>
      ) : null}
    </div>
  );
}
