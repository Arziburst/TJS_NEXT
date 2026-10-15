"use client";

import { useTranslations } from "next-intl";
import { searchSettlementsAction } from "@/lib/delivery/actions";
import type { Settlement } from "@/lib/delivery/nova-poshta/types";
import { SearchCombobox } from "./search-combobox";

// a letter or two match hundreds of places (MIN_QUERY_LENGTH on the server)
const MIN_LETTERS = 2;

/** The recipient's city or village, searched in the Nova Poshta dictionary as the customer types. */
export function CityCombobox({ value, onChange }: { value: Settlement | null; onChange: (city: Settlement | null) => void }) {
  const t = useTranslations("checkout.delivery.city");
  return (
    <SearchCombobox
      slot="delivery-city-combobox"
      label={t("label")}
      placeholder={t("placeholder")}
      value={value}
      onValueChange={onChange}
      search={searchSettlementsAction}
      itemKey={(city) => city.ref}
      itemLabel={(city) => city.name}
      renderItem={(city) => (
        <>
          <span className="font-semibold">{city.name}</span>
          <span className="text-xs opacity-80">{city.label}</span>
        </>
      )}
      minLength={MIN_LETTERS}
    />
  );
}
