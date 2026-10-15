import { getLocale } from "next-intl/server";
import { Suspense } from "react";
import { getCurrencyChoice } from "@/lib/money/prices";
import type { Currency } from "@/lib/money/currencies";
import { currencySymbol } from "@/lib/money/format";
import { CurrencySwitcher, type CurrencyOption } from "./currency-switcher";

type CurrencySwitcherSlotProps = {
  className?: string;
  hideLabel?: boolean;
};

// "EUR €", "UAH ₴", "CHF": labels come from the server's Intl data, so the client never renders its own
function optionLabel(currency: Currency, locale: string): string {
  const symbol = currencySymbol(currency, locale);
  return symbol !== currency ? `${currency} ${symbol}` : currency;
}

async function CurrencySwitcherValue({ className, hideLabel }: CurrencySwitcherSlotProps) {
  const [{ current, options }, locale] = await Promise.all([getCurrencyChoice(), getLocale()]);
  const labelled: CurrencyOption[] = options.map((value) => ({ value, label: optionLabel(value, locale) }));
  return <CurrencySwitcher current={current} options={labelled} className={className} hideLabel={hideLabel} />;
}

/*
 * The header's currency switcher; the visitor's currency is request-time data, so it streams in.
 * The placeholder is a block exactly as tall as the select: an inline-block would sit on a text line and
 * add the line's descent, so the header would shrink when the switcher arrives (#57).
 */
export function CurrencySwitcherSlot(props: CurrencySwitcherSlotProps) {
  return (
    <Suspense fallback={<span aria-hidden className="block h-11 w-20" />}>
      <CurrencySwitcherValue {...props} />
    </Suspense>
  );
}
