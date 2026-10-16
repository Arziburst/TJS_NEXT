import { BUSINESS_TIME_ZONE } from "@/lib/money/business-date";

/** A moment of an order (a status step) in the visitor's language, on the shop's (Kyiv) clock. */
export function orderDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: BUSINESS_TIME_ZONE }).format(
    new Date(iso),
  );
}
