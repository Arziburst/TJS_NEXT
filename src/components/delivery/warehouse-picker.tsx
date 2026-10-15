"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { searchWarehousesAction } from "@/lib/delivery/actions";
import type { Warehouse, WarehouseFilter } from "@/lib/delivery/nova-poshta/types";
import { cn } from "@/lib/utils";
import { SearchCombobox } from "./search-combobox";

const FILTERS: WarehouseFilter[] = ["all", "branch", "postomat"];

type WarehousePickerProps = {
  settlementRef: string;
  filter: WarehouseFilter;
  onFilterChange: (filter: WarehouseFilter) => void;
  value: Warehouse | null;
  onChange: (warehouse: Warehouse | null) => void;
};

/**
 * A branch or parcel locker of the chosen city: a type filter (all, branches, parcel lockers) and a search by
 * number or street. The list opens with the first points of the city, before anything is typed.
 */
export function WarehousePicker({ settlementRef, filter, onFilterChange, value, onChange }: WarehousePickerProps) {
  const t = useTranslations("checkout.delivery.warehouse");
  const legendId = useId();

  return (
    <div data-slot="delivery-warehouse-picker" className="grid gap-3">
      <fieldset aria-labelledby={legendId} className="grid gap-2">
        <span id={legendId} className="font-sans text-sm font-semibold">
          {t("filter")}
        </span>
        <div className="grid grid-cols-3 border-2 border-input">
          {FILTERS.map((option) => (
            <label
              key={option}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center px-2 text-center font-input text-sm transition has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                option === filter ? "bg-primary text-primary-foreground" : "hover:opacity-70",
              )}
            >
              <input
                type="radio"
                name={`${legendId}-filter`}
                value={option}
                checked={option === filter}
                onChange={() => onFilterChange(option)}
                className="sr-only"
              />
              {t(option)}
            </label>
          ))}
        </div>
      </fieldset>

      <SearchCombobox
        slot="delivery-warehouse-combobox"
        label={t("label")}
        placeholder={t("placeholder")}
        value={value}
        onValueChange={onChange}
        search={(query) => searchWarehousesAction({ settlementRef, filter, query })}
        itemKey={(warehouse) => warehouse.ref}
        itemLabel={(warehouse) => warehouse.name}
        renderItem={(warehouse) => (
          <>
            <span>{warehouse.name}</span>
            {warehouse.maxWeightKg ? (
              <span className="text-xs opacity-80">{t("maxWeight", { kg: warehouse.maxWeightKg })}</span>
            ) : null}
          </>
        )}
        minLength={0}
        scope={`${settlementRef}:${filter}`}
      />
    </div>
  );
}
