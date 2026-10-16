import { BUSINESS_TIME_ZONE } from "@/lib/money/business-date";

// Formatting of the admin's order pages: times on the shop's clock (Kyiv), country names in the admin's locale.

export function formatOrderTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: BUSINESS_TIME_ZONE }).format(
    new Date(iso),
  );
}

export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function customerName(firstName: string, lastName: string | null): string {
  return lastName ? `${firstName} ${lastName}` : firstName;
}
