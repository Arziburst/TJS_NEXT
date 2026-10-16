"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { saveAddressAction, type AddressResult } from "@/app/[locale]/account/actions";
import { AddressForm as NovaPoshtaAddressForm, type DeliveryAddress } from "@/components/delivery/address-form";
import { CityCombobox } from "@/components/delivery/city-combobox";
import { DivisionPicker } from "@/components/delivery/nova-post/division-picker";
import { SettlementCombobox } from "@/components/delivery/nova-post/settlement-combobox";
import { WarehousePicker } from "@/components/delivery/warehouse-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ADDRESS_LABEL_MAX_LENGTH, newAddressSchema, SAVED_ADDRESSES_MAX, type NewAddressInput } from "@/lib/account/schemas";
import type { DeliveryChoiceInput } from "@/lib/checkout/schema";
import type { Settlement as NovaPoshtaSettlement, Warehouse, WarehouseFilter } from "@/lib/delivery/nova-poshta/types";
import { hasDivisions, type DeliveryCountry } from "@/lib/delivery/nova-post/countries";
import type { Division, Settlement as NovaPostSettlement } from "@/lib/delivery/nova-post/types";
import { cn } from "@/lib/utils";

export type AddressCountry = "UA" | DeliveryCountry;

type Method = "warehouse" | "address" | "division";

// The Nova Post courier address fields, with the API's addressParts limits (as the checkout's form)
const ABROAD_FIELDS = [
  { name: "city", maxLength: 100, autoComplete: "address-level2", required: true },
  { name: "postCode", maxLength: 10, autoComplete: "postal-code", required: true },
  { name: "street", maxLength: 100, autoComplete: "address-line1", required: true },
  { name: "building", maxLength: 100, autoComplete: "off", required: true },
  { name: "flat", maxLength: 10, autoComplete: "address-line2", required: false },
] as const;

type AbroadAddress = Record<(typeof ABROAD_FIELDS)[number]["name"], string>;

const EMPTY_NP_ADDRESS: DeliveryAddress = { street: null, house: "", flat: "" };
const EMPTY_ABROAD: AbroadAddress = { city: "", postCode: "", street: "", building: "", flat: "" };

type Props = {
  countries: { code: AddressCountry; label: string }[];
  // true when the Nova Post API is configured: branches, lockers and pick-up points abroad can be searched
  novaPostLive: boolean;
};

/*
 * A new saved address: an optional name, the country, then the same pieces the checkout uses to choose the
 * destination (Nova Poshta city and branch or courier address in Ukraine; Nova Post point or courier address
 * abroad), without a delivery estimate: there is no order yet. Mobile first, one column.
 */
export function NewAddressForm({ countries, novaPostLive }: Props) {
  const t = useTranslations("account.addresses");
  const tAbroad = useTranslations("checkout.internationalDelivery.address");
  const id = useId();
  const [label, setLabel] = useState("");
  const [country, setCountry] = useState<AddressCountry | null>(null);
  const [method, setMethod] = useState<Method>("warehouse");
  const [city, setCity] = useState<NovaPoshtaSettlement | null>(null);
  const [filter, setFilter] = useState<WarehouseFilter>("all");
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [npAddress, setNpAddress] = useState<DeliveryAddress>(EMPTY_NP_ADDRESS);
  const [settlement, setSettlement] = useState<NovaPostSettlement | null>(null);
  const [division, setDivision] = useState<Division | null>(null);
  const [abroad, setAbroad] = useState<AbroadAddress>(EMPTY_ABROAD);
  const [error, setError] = useState<{ field: "delivery" | "label" | null; text: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const ukraine = country === "UA";
  const divisionsOffered = !ukraine && country !== null && novaPostLive && hasDivisions(country);
  const methods: Method[] = ukraine ? ["warehouse", "address"] : divisionsOffered ? ["division", "address"] : ["address"];
  const activeMethod: Method = methods.includes(method) ? method : methods[0];
  const addressAllowed = city?.addressDelivery ?? false;

  function reset(nextCountry: AddressCountry | null) {
    setCountry(nextCountry);
    setMethod(nextCountry === "UA" ? "warehouse" : "division");
    setCity(null);
    setWarehouse(null);
    setNpAddress(EMPTY_NP_ADDRESS);
    setSettlement(null);
    setDivision(null);
    setAbroad(EMPTY_ABROAD);
  }

  function touched() {
    setError(null);
    setSaved(false);
  }

  function delivery(): DeliveryChoiceInput | null {
    if (!country) return null;
    if (ukraine) {
      if (!city) return null;
      const npCity = { ref: city.ref, cityRef: city.cityRef, label: city.label };
      if (activeMethod === "address" && addressAllowed) {
        if (!npAddress.street) return null;
        return {
          kind: "novaPoshtaAddress",
          city: npCity,
          street: { ref: npAddress.street.ref, label: npAddress.street.label },
          house: npAddress.house,
          flat: npAddress.flat,
        };
      }
      if (!warehouse) return null;
      const { ref, kind, number, name } = warehouse;
      return { kind: "novaPoshtaWarehouse", city: npCity, warehouse: { ref, kind, number, name } };
    }
    if (activeMethod === "division") {
      if (!settlement || !division) return null;
      const { id: divisionId, number, name, category, address } = division;
      return {
        kind: "novaPostDivision",
        country,
        settlement: { id: settlement.id, name: settlement.name },
        division: { id: divisionId, number, name, category, address },
      };
    }
    return { kind: "novaPostAddress", country, ...abroad };
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    touched();
    const choice = delivery();
    const input: NewAddressInput | null = choice ? { label, delivery: choice } : null;
    const parsed = input ? newAddressSchema.safeParse(input) : null;
    if (!input || !parsed?.success) {
      const labelWrong = parsed?.error?.issues.some((issue) => issue.path[0] === "label") ?? false;
      setError(labelWrong ? { field: "label", text: t("errors.label") } : { field: "delivery", text: t("errors.delivery") });
      return;
    }
    startTransition(async () => {
      const result = await saveAddressAction(input).catch((): AddressResult => ({ ok: false, reason: "unexpectedError" }));
      if (result.ok) {
        setLabel("");
        reset(null);
        setSaved(true);
        return;
      }
      setError({
        field: result.reason === "invalid" ? "delivery" : null,
        text:
          result.reason === "invalid"
            ? t("errors.delivery")
            : result.reason === "limitReached"
              ? t("errors.limitReached", { max: SAVED_ADDRESSES_MAX })
              : result.reason === "rateLimited"
                ? t("errors.rateLimited")
                : result.reason === "signedOut"
                  ? t("errors.signedOut")
                  : t("errors.unexpected"),
      });
    });
  }

  const radioClass = (active: boolean, disabled = false) =>
    cn(
      "flex min-h-11 items-center gap-3 border-2 border-input px-3 py-2 font-input text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
      disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      active && "border-foreground bg-primary text-primary-foreground",
    );

  return (
    <form noValidate onSubmit={submit} onChange={touched} className="grid gap-5" data-testid="new-address-form">
      <div className="grid gap-2 sm:max-w-md">
        <label htmlFor={`${id}-label`} className="font-sans text-sm font-semibold">
          {t("label")}
        </label>
        <Input
          id={`${id}-label`}
          value={label}
          maxLength={ADDRESS_LABEL_MAX_LENGTH}
          autoComplete="off"
          onChange={(event) => setLabel(event.target.value)}
          aria-invalid={error?.field === "label" || undefined}
          aria-describedby={`${id}-label-hint`}
          className="text-base sm:text-sm"
        />
        <p id={`${id}-label-hint`} className="font-input text-xs text-foreground/70">
          {t("labelHint")}
        </p>
      </div>

      <div className="grid gap-2 sm:max-w-md">
        <label htmlFor={`${id}-country`} className="font-sans text-sm font-semibold">
          {t("country")}
        </label>
        <select
          id={`${id}-country`}
          value={country ?? ""}
          onChange={(event) => reset(countries.find((option) => option.code === event.target.value)?.code ?? null)}
          aria-invalid={(error?.field === "delivery" && !country) || undefined}
          className="h-11 w-full cursor-pointer rounded-none border-2 border-input bg-transparent px-2.5 font-input text-base text-foreground transition outline-none hover:opacity-70 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-accent sm:text-sm"
        >
          <option value="" disabled>
            {t("countryPlaceholder")}
          </option>
          {countries.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {country && (ukraine ? city !== null : methods.length > 1) ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 font-sans text-sm font-semibold">{t("method")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {methods.map((option) => {
              const disabled = ukraine && option === "address" && !addressAllowed;
              return (
                <label key={option} className={radioClass(activeMethod === option && !disabled, disabled)}>
                  <input
                    type="radio"
                    name={`${id}-method`}
                    value={option}
                    checked={activeMethod === option && !disabled}
                    disabled={disabled}
                    onChange={() => setMethod(option)}
                    className="size-4 accent-current"
                  />
                  {t(`methods.${option}`)}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {ukraine ? (
        <div className="grid gap-5">
          <CityCombobox
            value={city}
            onChange={(next) => {
              setCity(next);
              setWarehouse(null);
              setNpAddress(EMPTY_NP_ADDRESS);
              touched();
            }}
          />
          {city && (activeMethod === "warehouse" || !addressAllowed) ? (
            <WarehousePicker
              settlementRef={city.ref}
              filter={filter}
              onFilterChange={(next) => {
                setFilter(next);
                if (warehouse && next !== "all" && warehouse.kind !== next) setWarehouse(null);
              }}
              value={warehouse}
              onChange={(next) => {
                setWarehouse(next);
                touched();
              }}
            />
          ) : null}
          {city && activeMethod === "address" && addressAllowed ? (
            <NovaPoshtaAddressForm settlementRef={city.ref} value={npAddress} onChange={setNpAddress} />
          ) : null}
        </div>
      ) : country && activeMethod === "division" ? (
        <div className="grid gap-5">
          <SettlementCombobox
            key={country}
            country={country}
            value={settlement}
            onChange={(next) => {
              setSettlement(next);
              setDivision(null);
              touched();
            }}
          />
          {settlement ? (
            <DivisionPicker
              country={country}
              settlementId={settlement.id}
              value={division}
              onChange={(next) => {
                setDivision(next);
                touched();
              }}
            />
          ) : null}
        </div>
      ) : country ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {ABROAD_FIELDS.map((field) => (
            <div key={field.name} className={cn("grid gap-2", field.name === "street" && "sm:col-span-2")}>
              <label htmlFor={`${id}-${field.name}`} className="font-sans text-sm font-semibold">
                {tAbroad(field.name)}
              </label>
              <Input
                id={`${id}-${field.name}`}
                name={field.name}
                required={field.required}
                maxLength={field.maxLength}
                autoComplete={field.autoComplete}
                value={abroad[field.name]}
                onChange={(event) => setAbroad((current) => ({ ...current, [field.name]: event.target.value }))}
                className="text-base sm:text-sm"
              />
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="border-2 border-accent p-3 font-input text-sm" data-testid="new-address-error">
          {error.text}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={isPending} aria-busy={isPending || undefined}>
          {isPending ? t("saving") : t("save")}
        </Button>
        <p role="status" className="font-input text-sm" data-testid="new-address-status">
          {saved ? t("saved") : null}
        </p>
      </div>
    </form>
  );
}
