import { DELIVERY_COUNTRIES } from "@/lib/delivery/nova-post/countries";
import type { CountryOption } from "./country-select";

// The destinations with their names in `locale` (Intl data, no messages to keep), sorted the locale's way
export function countryOptions(locale: string): CountryOption[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const collator = new Intl.Collator(locale);
  return DELIVERY_COUNTRIES.map((code) => ({ code, label: names.of(code) ?? code })).sort((a, b) =>
    collator.compare(a.label, b.label),
  );
}
