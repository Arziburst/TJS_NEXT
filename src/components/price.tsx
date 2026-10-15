import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { decimalString } from "@/lib/money/format";
import { formatPrice, formatPriceTotal, type FormattedPrice, type PriceLine } from "@/lib/money/prices";
import { cn } from "@/lib/utils";

type PriceProps = {
  // the price as the admin entered it, in USD cents (D4)
  usdMinor: number;
  className?: string;
};

/*
 * A USD price in the visitor's currency (cookie, geo or locale default — D5), charm-rounded (D4).
 * Streams in its own Suspense boundary, since the currency is request-time data.
 */
export function Price({ usdMinor, className }: PriceProps) {
  return (
    <Suspense fallback={<span aria-hidden className={cn("inline-block h-[1em] w-16 animate-pulse bg-hairline", className)} />}>
      <PriceText price={formatPrice(usdMinor)} className={className} />
    </Suspense>
  );
}

type PriceTotalProps = {
  // USD cents per unit (D4) and the number of units
  lines: readonly PriceLine[];
  className?: string;
};

/*
 * The total of several prices in the visitor's currency: the displayed unit prices times their quantities,
 * so it equals the sum of the <Price>s shown next to it (never a re-rounded USD sum). Streams like <Price>.
 */
export function PriceTotal({ lines, className }: PriceTotalProps) {
  return (
    <Suspense fallback={<span aria-hidden className={cn("inline-block h-[1em] w-16 animate-pulse bg-hairline", className)} />}>
      <PriceText price={formatPriceTotal(lines)} className={className} />
    </Suspense>
  );
}

async function PriceText({ price: pending, className }: { price: Promise<FormattedPrice | null>; className?: string }) {
  const [price, t] = await Promise.all([pending, getTranslations("common.price")]);

  if (!price) {
    return (
      <span className={className} data-slot="price">
        <span aria-hidden>{t("none")}</span>
        <span className="sr-only">{t("unavailable")}</span>
      </span>
    );
  }

  return (
    <data value={decimalString(price)} data-currency={price.currency} data-slot="price" className={cn("tabular-nums", className)}>
      {price.text}
    </data>
  );
}
