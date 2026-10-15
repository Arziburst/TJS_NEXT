// Business dates are Kyiv dates: NBU sets its rates on Kyiv time, whatever the server's own zone is.
export const BUSINESS_TIME_ZONE = "Europe/Kyiv";

const kyivDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// The Kyiv calendar date of `now` plus `days`, as YYYY-MM-DD
export function businessDate(now: Date, days = 0): string {
  const [year, month, day] = kyivDateFormat.format(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
