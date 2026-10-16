"use client";

import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { DeliveryQuote, type QuoteRequest } from "@/components/delivery/delivery-quote";
import { CustomsNotice } from "@/components/delivery/nova-post/customs-notice";
import { QuoteLine, type QuoteFailure } from "@/components/delivery/nova-post/quote-line";
import type { DeliveryChoiceInput } from "@/lib/checkout/schema";
import { estimateNovaPostDelivery, type QuoteView } from "@/lib/delivery/nova-post/actions";
import type { OrderGoods } from "@/lib/delivery/nova-post/parcel";
import type { Destination } from "@/lib/delivery/nova-post/types";

type Props = {
  choice: DeliveryChoiceInput;
  parcel: { weightGrams: number; declaredValueMinor: number };
  goods: OrderGoods | null;
};

type Answer = { key: string; quote: QuoteView | null; failure: QuoteFailure | null };

/*
 * The delivery estimate of a saved destination, with the same pieces the checkout's pickers show: the Nova
 * Poshta tariff in Ukraine, Nova Post's estimate (or the zone's flat rate) with the customs notice abroad. The
 * server computes the estimate again when the request is sent.
 */
export function SavedDeliveryQuote({ choice, parcel, goods }: Props) {
  const locale = useLocale();
  const { weightGrams, declaredValueMinor } = parcel;

  const novaPoshtaRequest = useMemo((): QuoteRequest | null => {
    if (choice.kind === "novaPoshtaWarehouse") {
      const recipient = choice.warehouse.kind === "postomat" ? "postomat" : "warehouse";
      return { cityRef: choice.city.cityRef, recipient, parcel: { weightGrams, declaredValueMinor } };
    }
    if (choice.kind === "novaPoshtaAddress") return { cityRef: choice.city.cityRef, recipient: "doors", parcel: { weightGrams, declaredValueMinor } };
    return null;
  }, [choice, weightGrams, declaredValueMinor]);

  const abroad = useMemo(() => {
    if (choice.kind === "novaPostDivision") {
      return { country: choice.country, destination: { kind: "division", divisionId: choice.division.id } satisfies Destination };
    }
    if (choice.kind === "novaPostAddress") {
      const { city, postCode, street, building, flat } = choice;
      const destination: Destination = { kind: "address", city, postCode, street, building, ...(flat ? { flat } : {}) };
      return { country: choice.country, destination };
    }
    return null;
  }, [choice]);
  const key = abroad ? JSON.stringify(abroad) : null;
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (!abroad || !key) return;
    let live = true;
    estimateNovaPostDelivery({ ...abroad, goods, locale })
      .catch(() => ({ ok: false as const, reason: "unavailable" as const }))
      .then((result) => {
        if (!live) return;
        setAnswer(
          result.ok
            ? { key, quote: result.quote, failure: null }
            : { key, quote: null, failure: result.reason === "rateLimited" ? "rateLimited" : "error" },
        );
      });
    return () => {
      live = false;
    };
  }, [abroad, key, goods, locale]);

  if (novaPoshtaRequest) return <DeliveryQuote request={novaPoshtaRequest} />;
  const current = answer?.key === key ? answer : null;
  return (
    <div className="grid gap-3 border-t-2 border-hairline pt-4">
      <QuoteLine quote={current?.quote ?? null} pending={!current} failure={current?.failure ?? null} />
      <CustomsNotice />
    </div>
  );
}
