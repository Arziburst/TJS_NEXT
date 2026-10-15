import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { decimalString } from "@/lib/money/format";
import { formatPrice } from "@/lib/money/prices";
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
      <PriceValue usdMinor={usdMinor} className={className} />
    </Suspense>
  );
}

async function PriceValue({ usdMinor, className }: PriceProps) {
  const [price, t] = await Promise.all([formatPrice(usdMinor), getTranslations("common.price")]);

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
