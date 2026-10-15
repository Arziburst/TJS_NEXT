"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState } from "react";
import type { Settlement, Street, Warehouse, WarehouseFilter } from "@/lib/delivery/nova-poshta/types";
import { cn } from "@/lib/utils";
import { AddressForm, type DeliveryAddress } from "./address-form";
import { CityCombobox } from "./city-combobox";
import { DeliveryQuote, type QuoteRequest } from "./delivery-quote";
import { WarehousePicker } from "./warehouse-picker";

type Method = "warehouse" | "address";

// What the checkout (#24) stores on the order request; null until the destination is complete
export type NovaPoshtaSelection =
  | { method: "warehouse"; city: Settlement; warehouse: Warehouse }
  | { method: "address"; city: Settlement; street: Street; house: string; flat: string };

const EMPTY_ADDRESS: DeliveryAddress = { street: null, house: "", flat: "" };

type NovaPoshtaDeliveryProps = {
  // the order's parcel: its weight and declared value (the order total in UAH kopiykas, D35)
  parcel: { weightGrams: number; declaredValueMinor: number };
  onChange?: (selection: NovaPoshtaSelection | null) => void;
};

/**
 * Delivery in Ukraine with Nova Poshta: the city, then a branch or parcel locker, or a courier address, and the
 * estimated price. Mobile first: one column, full-width fields, large touch targets.
 */
export function NovaPoshtaDelivery({ parcel, onChange }: NovaPoshtaDeliveryProps) {
  const t = useTranslations("checkout.delivery");
  const methodId = useId();
  const [city, setCity] = useState<Settlement | null>(null);
  const [method, setMethod] = useState<Method>("warehouse");
  const [filter, setFilter] = useState<WarehouseFilter>("all");
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [address, setAddress] = useState<DeliveryAddress>(EMPTY_ADDRESS);

  const addressAllowed = city?.addressDelivery ?? false;
  const activeMethod: Method = method === "address" && addressAllowed ? "address" : "warehouse";

  function chooseCity(next: Settlement | null) {
    setCity(next);
    setWarehouse(null);
    setAddress(EMPTY_ADDRESS);
  }

  function chooseFilter(next: WarehouseFilter) {
    setFilter(next);
    if (warehouse && next !== "all" && warehouse.kind !== next) setWarehouse(null);
  }

  const selection = useMemo((): NovaPoshtaSelection | null => {
    if (!city) return null;
    if (activeMethod === "warehouse") return warehouse ? { method: "warehouse", city, warehouse } : null;
    const house = address.house.trim();
    return address.street && house ? { method: "address", city, street: address.street, house, flat: address.flat.trim() } : null;
  }, [city, activeMethod, warehouse, address]);

  useEffect(() => {
    onChange?.(selection);
  }, [onChange, selection]);

  const { weightGrams, declaredValueMinor } = parcel;
  const quoteRequest = useMemo((): QuoteRequest | null => {
    if (!city) return null;
    const recipient = activeMethod === "address" ? "doors" : warehouse?.kind === "postomat" ? "postomat" : "warehouse";
    // the price depends on the city and the kind of point, not on which branch of the city
    if (activeMethod === "warehouse" && !warehouse) return null;
    return { cityRef: city.cityRef, recipient, parcel: { weightGrams, declaredValueMinor } };
  }, [city, activeMethod, warehouse, weightGrams, declaredValueMinor]);

  return (
    <section data-slot="nova-poshta-delivery" className="grid gap-5">
      <CityCombobox value={city} onChange={chooseCity} />

      {city ? (
        <fieldset aria-labelledby={methodId} className="grid gap-2">
          <span id={methodId} className="font-sans text-sm font-semibold">
            {t("method.label")}
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["warehouse", "address"] as const).map((option) => {
              const disabled = option === "address" && !addressAllowed;
              return (
                <label
                  key={option}
                  className={cn(
                    "flex min-h-11 items-center gap-3 border-2 border-input px-3 py-2 font-input text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                    activeMethod === option && "border-foreground bg-primary text-primary-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name={`${methodId}-method`}
                    value={option}
                    checked={activeMethod === option}
                    disabled={disabled}
                    onChange={() => setMethod(option)}
                    className="size-4 accent-current"
                  />
                  {t(`method.${option}`)}
                </label>
              );
            })}
          </div>
          {!addressAllowed ? <p className="font-input text-xs text-foreground/70">{t("method.addressUnavailable")}</p> : null}
        </fieldset>
      ) : null}

      {city && activeMethod === "warehouse" ? (
        <WarehousePicker
          settlementRef={city.ref}
          filter={filter}
          onFilterChange={chooseFilter}
          value={warehouse}
          onChange={setWarehouse}
        />
      ) : null}

      {city && activeMethod === "address" ? <AddressForm settlementRef={city.ref} value={address} onChange={setAddress} /> : null}

      <DeliveryQuote request={quoteRequest} />
    </section>
  );
}
