"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import type { DeliveryCountry } from "@/lib/delivery/nova-post/countries";
import { cn } from "@/lib/utils";

// A destination with its name in the visitor's locale (Intl data, from the server)
export type CountryOption = { code: DeliveryCountry; label: string };

type CountrySelectProps = {
  countries: CountryOption[];
  value: DeliveryCountry | null;
  onChange: (country: DeliveryCountry) => void;
  className?: string;
};

// The destination country: the EU member states and Switzerland only (D2); a native select, so a phone shows its own picker
export function CountrySelect({ countries, value, onChange, className }: CountrySelectProps) {
  const t = useTranslations("checkout.internationalDelivery");
  const id = useId();

  return (
    <div className={cn("grid gap-2", className)}>
      <label htmlFor={id} className="font-sans text-sm font-semibold">
        {t("country")}
      </label>
      <select
        id={id}
        name="country"
        value={value ?? ""}
        onChange={(event) => {
          const next = countries.find((country) => country.code === event.target.value);
          if (next) onChange(next.code);
        }}
        className="h-11 w-full cursor-pointer rounded-none border-2 border-input bg-transparent px-2.5 font-input text-sm text-foreground transition outline-none hover:opacity-70 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <option value="" disabled>
          {t("countryPlaceholder")}
        </option>
        {countries.map((country) => (
          <option key={country.code} value={country.code}>
            {country.label}
          </option>
        ))}
      </select>
    </div>
  );
}
