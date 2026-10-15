"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { searchStreetsAction } from "@/lib/delivery/actions";
import type { Street } from "@/lib/delivery/nova-poshta/types";
import { SearchCombobox } from "./search-combobox";

export type DeliveryAddress = { street: Street | null; house: string; flat: string };

// house and flat numbers as Nova Poshta takes them ("16А", "2/3")
const NUMBER_MAX_LENGTH = 10;

/** Courier delivery: a street of the chosen city (searched), the house and an optional flat. */
export function AddressForm({
  settlementRef,
  value,
  onChange,
}: {
  settlementRef: string;
  value: DeliveryAddress;
  onChange: (address: DeliveryAddress) => void;
}) {
  const t = useTranslations("checkout.delivery.address");
  const houseId = useId();
  const flatId = useId();

  return (
    <div data-slot="delivery-address-form" className="grid gap-4">
      <SearchCombobox
        slot="delivery-street-combobox"
        label={t("street")}
        placeholder={t("streetPlaceholder")}
        value={value.street}
        onValueChange={(street) => onChange({ ...value, street })}
        search={(query) => searchStreetsAction({ settlementRef, query })}
        itemKey={(street) => street.ref}
        itemLabel={(street) => street.label}
        minLength={2}
        scope={settlementRef}
      />
      <div className="grid grid-cols-2 items-end gap-4 sm:max-w-sm">
        <div className="grid gap-2">
          <label htmlFor={houseId} className="font-sans text-sm font-semibold">
            {t("house")}
          </label>
          <Input
            id={houseId}
            value={value.house}
            onChange={(event) => onChange({ ...value, house: event.target.value })}
            maxLength={NUMBER_MAX_LENGTH}
            autoComplete="off"
            required
            className="text-base sm:text-sm"
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor={flatId} className="font-sans text-sm font-semibold">
            {t("flat")}
          </label>
          <Input
            id={flatId}
            value={value.flat}
            onChange={(event) => onChange({ ...value, flat: event.target.value })}
            maxLength={NUMBER_MAX_LENGTH}
            autoComplete="off"
            className="text-base sm:text-sm"
          />
        </div>
      </div>
    </div>
  );
}
