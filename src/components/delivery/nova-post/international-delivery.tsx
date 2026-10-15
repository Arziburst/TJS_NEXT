"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { estimateNovaPostDelivery, type QuoteView } from "@/lib/delivery/nova-post/actions";
import { hasDivisions, type DeliveryCountry } from "@/lib/delivery/nova-post/countries";
import type { OrderGoods } from "@/lib/delivery/nova-post/parcel";
import type { Destination, Division, Settlement } from "@/lib/delivery/nova-post/types";
import { cn } from "@/lib/utils";
import { AddressForm, type AddressValue } from "./address-form";
import { CountrySelect, type CountryOption } from "./country-select";
import { CustomsNotice } from "./customs-notice";
import { DivisionPicker } from "./division-picker";
import { QuoteLine, type QuoteFailure } from "./quote-line";
import { SettlementCombobox } from "./settlement-combobox";

type Method = "division" | "address";

// What the checkout (#24) stores on the order request; null until the destination is complete
export type NovaPostSelection =
  | { kind: "division"; country: DeliveryCountry; settlement: Settlement; division: Division }
  | { kind: "address"; country: DeliveryCountry; address: AddressValue };

type InternationalDeliveryProps = {
  countries: CountryOption[];
  // true when the Nova Post API is configured: branches, lockers and pick-up points can then be searched
  live: boolean;
  // the order's goods (goodsOf on the server-side cart); null leaves the estimate to the zone flat rate
  goods: OrderGoods | null;
  defaultCountry?: DeliveryCountry;
  // the country is chosen outside (the checkout's own country field): no country select here
  fixedCountry?: DeliveryCountry;
  onChange?: (selection: NovaPostSelection | null) => void;
  className?: string;
};

type QuoteState = { quote: QuoteView | null; failure: QuoteFailure | null };

/*
 * The delivery step abroad for the checkout (#24): country → town → branch, locker or pick-up point, or a
 * courier address → the estimate in the visitor's currency with the customs notice. Without the API only
 * the address is asked, and the zone's flat rate is the estimate.
 */
export function InternationalDelivery({
  countries,
  live,
  goods,
  defaultCountry,
  fixedCountry,
  onChange,
  className,
}: InternationalDeliveryProps) {
  const t = useTranslations("checkout.internationalDelivery");
  const locale = useLocale();
  const methodName = useId();
  const [chosenCountry, setCountry] = useState<DeliveryCountry | null>(defaultCountry ?? null);
  const [method, setMethod] = useState<Method>("division");
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [division, setDivision] = useState<Division | null>(null);
  const [state, setState] = useState<QuoteState>({ quote: null, failure: null });
  const [isPending, startTransition] = useTransition();
  const request = useRef(0);

  const country = fixedCountry ?? chosenCountry;
  const divisionsOffered = live && country !== null && hasDivisions(country);
  const activeMethod: Method = divisionsOffered ? method : "address";
  const countryName = countries.find((option) => option.code === country)?.label ?? "";

  function reset() {
    request.current++;
    setState({ quote: null, failure: null });
    onChange?.(null);
  }

  function estimate(destination: Destination) {
    if (!country) return;
    const current = ++request.current;
    startTransition(async () => {
      const result = await estimateNovaPostDelivery({ country, destination, goods, locale });
      if (current !== request.current) return;
      setState(
        result.ok
          ? { quote: result.quote, failure: null }
          : { quote: null, failure: result.reason === "rateLimited" ? "rateLimited" : "error" },
      );
    });
  }

  function submitAddress(address: AddressValue) {
    if (country) onChange?.({ kind: "address", country, address });
    estimate({ kind: "address", ...address, flat: address.flat || undefined });
  }

  return (
    <section className={cn("grid gap-6", className)} data-slot="international-delivery">
      {fixedCountry ? null : (
        <CountrySelect
          countries={countries}
          value={country}
          onChange={(next) => {
            setCountry(next);
            setSettlement(null);
            setDivision(null);
            reset();
          }}
        />
      )}

      {country ? (
        <>
          {divisionsOffered ? (
            <fieldset className="grid gap-2">
              <legend className="mb-2 font-sans text-sm font-semibold">{t("method")}</legend>
              {(["division", "address"] as const).map((option) => (
                <label key={option} className="flex min-h-11 cursor-pointer items-center gap-3 font-input text-sm">
                  <input
                    type="radio"
                    name={methodName}
                    value={option}
                    checked={method === option}
                    onChange={() => {
                      setMethod(option);
                      setDivision(null);
                      reset();
                    }}
                    className="size-4 accent-primary"
                  />
                  {t(`methods.${option}`)}
                </label>
              ))}
            </fieldset>
          ) : hasDivisions(country) ? null : (
            <p className="font-input text-sm">{t("courierOnly", { country: countryName })}</p>
          )}

          {activeMethod === "division" ? (
            <>
              <SettlementCombobox
                key={country}
                country={country}
                value={settlement}
                onChange={(next) => {
                  setSettlement(next);
                  setDivision(null);
                  reset();
                }}
              />
              {settlement ? (
                <DivisionPicker
                  country={country}
                  settlementId={settlement.id}
                  value={division}
                  onChange={(next) => {
                    setDivision(next);
                    if (next) {
                      onChange?.({ kind: "division", country, settlement, division: next });
                      estimate({ kind: "division", divisionId: next.id });
                    } else {
                      reset();
                    }
                  }}
                />
              ) : null}
            </>
          ) : (
            <AddressForm key={country} pending={isPending} onSubmit={submitAddress} />
          )}

          <div className="grid gap-3 border-t-2 border-hairline pt-4">
            <QuoteLine quote={state.quote} pending={isPending} failure={state.failure} />
            <CustomsNotice />
          </div>
        </>
      ) : null}
    </section>
  );
}
