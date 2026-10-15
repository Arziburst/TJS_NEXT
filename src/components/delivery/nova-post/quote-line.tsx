import { useTranslations } from "next-intl";
import type { QuoteView } from "@/lib/delivery/nova-post/actions";
import { cn } from "@/lib/utils";

// Why no quote came back: an error, or the client's request budget is spent for the minute
export type QuoteFailure = "error" | "rateLimited";

type QuoteLineProps = {
  // null while nothing is asked yet
  quote: QuoteView | null;
  pending?: boolean;
  failure?: QuoteFailure | null;
  className?: string;
};

/*
 * The delivery line of the order summary. Every price here is an estimate and marked so (D37): Nova Post's
 * price for the estimate box with its scheduled date, or the zone's flat rate. An amount the owner has not set
 * shows "TBD", never a made-up number.
 */
export function QuoteLine({ quote, pending = false, failure = null, className }: QuoteLineProps) {
  const t = useTranslations("checkout.internationalDelivery");
  const shown = !pending && !failure ? quote : null;

  function value() {
    if (pending) return <span className="text-foreground/70">{t("quote.calculating")}</span>;
    if (failure) return <span>{failure === "rateLimited" ? t("tooManyRequests") : t("quote.error")}</span>;
    if (!quote) return <span aria-hidden>{t("quote.none")}</span>;
    const { price } = quote;
    if (price.state === "tbd") return <span data-slot="price-tbd">{t("quote.tbd")}</span>;
    if (price.state === "unavailable") return <span>{t("quote.unavailable")}</span>;
    return (
      <data value={price.value} data-currency={price.currency} data-slot="price" className="tabular-nums">
        <span aria-hidden>{t("quote.approx")}</span>
        {price.text}
      </data>
    );
  }

  function note(): string | null {
    if (!shown) return null;
    if (shown.price.state === "tbd") return t("quote.tbdNote");
    return shown.source === "carrier" ? t("quote.carrierNote") : t("quote.estimateNote");
  }
  const noteText = note();

  return (
    <div data-slot="quote-line" data-source={shown?.source} aria-live="polite" className={cn("grid gap-1", className)}>
      <div className="flex items-baseline justify-between gap-4 font-sans">
        <span className="text-sm font-semibold">
          {t("quote.label")}
          {shown ? (
            <span data-slot="estimate-mark" className="ml-2 border border-foreground px-1.5 py-0.5 text-xs font-medium uppercase">
              {t("quote.estimate")}
            </span>
          ) : null}
        </span>
        <span className="text-base font-semibold text-accent-text">{value()}</span>
      </div>
      {shown?.deliveryDate ? <p className="font-input text-sm">{t("quote.deliveryDate", { date: shown.deliveryDate })}</p> : null}
      {noteText ? <p className="font-input text-xs text-foreground/80">{noteText}</p> : null}
    </div>
  );
}
