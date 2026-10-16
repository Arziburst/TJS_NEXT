import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { decimalString } from "@/lib/money/format";
import { formatPrice, formatPriceTotal, type FormattedPrice, type PriceLine } from "@/lib/money/prices";
import { cn } from "@/lib/utils";

type PriceProps = {
  // the price as the shopper pays it, in USD cents (D4): the sale price while a sale runs (#67)
  usdMinor: number;
  // the regular price, struck through before `usdMinor` when it is higher (a running sale)
  regularUsdMinor?: number;
  // the lowest of several prices (a product whose sizes differ in price, #66): "from …"
  from?: boolean;
  className?: string;
};

/*
 * A USD price in the visitor's currency (cookie, geo or locale default — D5), charm-rounded (D4); on sale, the
 * regular price struck through before it, converted by the same rules. Streams in its own Suspense boundary,
 * since the currency is request-time data.
 */
export function Price({ usdMinor, regularUsdMinor, from = false, className }: PriceProps) {
  const regular = regularUsdMinor !== undefined && regularUsdMinor > usdMinor ? formatPrice(regularUsdMinor) : null;
  return (
    <Suspense fallback={<span aria-hidden className={cn("inline-block h-[1em] w-16 animate-pulse bg-hairline", className)} />}>
      <PriceText price={formatPrice(usdMinor)} regular={regular} from={from} className={className} />
    </Suspense>
  );
}

type PriceTotalProps = {
  // USD cents per unit (D4) and the number of units
  lines: readonly PriceLine[];
  // the same lines at their regular prices: the total struck through before it when higher (a running sale, #67)
  regularLines?: readonly PriceLine[];
  className?: string;
};

/*
 * The total of several prices in the visitor's currency: the displayed unit prices times their quantities,
 * so it equals the sum of the <Price>s shown next to it (never a re-rounded USD sum). Streams like <Price>.
 */
export function PriceTotal({ lines, regularLines, className }: PriceTotalProps) {
  const regular = regularLines && regularLines.some((line, i) => line.usdMinor > (lines[i]?.usdMinor ?? line.usdMinor))
    ? formatPriceTotal(regularLines)
    : null;
  return (
    <Suspense fallback={<span aria-hidden className={cn("inline-block h-[1em] w-16 animate-pulse bg-hairline", className)} />}>
      <PriceText price={formatPriceTotal(lines)} regular={regular} className={className} />
    </Suspense>
  );
}

async function PriceText({
  price: pending,
  regular: pendingRegular = null,
  from = false,
  className,
}: {
  price: Promise<FormattedPrice | null>;
  regular?: Promise<FormattedPrice | null> | null;
  from?: boolean;
  className?: string;
}) {
  const [price, regular, t] = await Promise.all([pending, pendingRegular, getTranslations("common.price")]);

  if (!price) {
    return (
      <span className={className} data-slot="price">
        <span aria-hidden>{t("none")}</span>
        <span className="sr-only">{t("unavailable")}</span>
      </span>
    );
  }

  const text = from ? t("from", { price: price.text }) : price.text;
  const current = (
    <data
      value={decimalString(price)}
      data-currency={price.currency}
      data-slot="price"
      data-from={from || undefined}
      data-sale={regular ? true : undefined}
      className={cn("tabular-nums", !regular && className)}
    >
      {text}
    </data>
  );
  // the struck price differs only when both round to different displayed prices
  if (!regular || regular.amountMinor <= price.amountMinor) return current;

  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)} data-slot="sale-price">
      <span className="sr-only">{t("regular")}</span>
      <del data-slot="regular-price" data-value={decimalString(regular)} className="text-[0.85em] text-foreground/60 tabular-nums">
        {regular.text}
      </del>
      <span className="sr-only">{t("sale")}</span>
      {current}
    </span>
  );
}
