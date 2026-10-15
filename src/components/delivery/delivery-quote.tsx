"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useState } from "react";
import { quoteAction } from "@/lib/delivery/actions";
import type { QuoteResult, RecipientService } from "@/lib/delivery/nova-poshta/types";
import { formatMoney } from "@/lib/money/format";

const QUOTE_DEBOUNCE_MS = 150;

export type QuoteRequest = {
  cityRef: string;
  recipient: RecipientService;
  parcel: { weightGrams: number; declaredValueMinor: number };
};

/**
 * The delivery line of the order: the Nova Poshta tariff for the chosen destination, marked as an estimate the
 * recipient pays on receipt (D35). Without a destination it says what to choose.
 */
export function DeliveryQuote({ request }: { request: QuoteRequest | null }) {
  const t = useTranslations("checkout.delivery.quote");
  const locale = useLocale();
  const [answer, setAnswer] = useState<{ key: string; result: QuoteResult } | null>(null);

  const key = request ? JSON.stringify(request) : null;
  const result = answer && answer.key === key ? answer.result : null;

  const fetchQuote = useEffectEvent(async (body: QuoteRequest, requestKey: string, isCurrent: () => boolean) => {
    const next = await quoteAction(body).catch((): QuoteResult => ({ ok: false, reason: "unavailable" }));
    if (isCurrent()) setAnswer({ key: requestKey, result: next });
  });

  // the caller keeps `request` stable (useMemo) while its content is unchanged; quick successive choices
  // (clicking through the filter) ask once
  useEffect(() => {
    if (!request || !key) return;
    let live = true;
    const timer = setTimeout(() => fetchQuote(request, key, () => live), QUOTE_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [request, key]);

  let value: string;
  if (!request) value = t("choose");
  else if (!result) value = t("calculating");
  else if (result.ok) value = t("estimate", { price: formatMoney({ currency: "UAH", amountMinor: result.costMinor, decimals: 2 }, locale) });
  else value = t("unavailable");

  return (
    <div data-slot="delivery-quote" className="grid gap-1 border-t-2 border-hairline pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-sans text-sm font-semibold">{t("label")}</span>
        <output aria-live="polite" className="font-input text-base tabular-nums">
          {value}
        </output>
      </div>
      {result?.ok ? <p className="font-input text-xs text-foreground/70">{t("note")}</p> : null}
    </div>
  );
}
