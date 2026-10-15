// Destinations of Nova Post international delivery (D2, D10): the EU member states and Switzerland, never
// the UK. ISO 3166-1 alpha-2 codes; country names come from Intl.DisplayNames in the visitor's locale.

// The 27 member states of the European Union
export const EU_MEMBER_STATES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
] as const;

export const SWITZERLAND = "CH";

// D2: EU + Switzerland; the UK (GB) is not a market and never offered
export const DELIVERY_COUNTRIES = [...EU_MEMBER_STATES, SWITZERLAND] as const;

export type DeliveryCountry = (typeof DELIVERY_COUNTRIES)[number];

export function isDeliveryCountry(value: unknown): value is DeliveryCountry {
  return typeof value === "string" && (DELIVERY_COUNTRIES as readonly string[]).includes(value);
}

/*
 * Member states with Nova Post's own network of branches, lockers and pick-up points: the EU countries
 * the public API's `GET /divisions` accepts as `countryCodes[]` (api.novapost.com/developers spec, 2026-10;
 * its other values GB, MD and UA are not destinations here). Elsewhere Nova Post delivers by courier to the
 * address.
 */
export const NETWORK_COUNTRIES = [
  "CZ", "DE", "EE", "ES", "FR", "HU", "IT", "LT", "LV", "NL", "PL", "RO", "SK",
] as const satisfies readonly DeliveryCountry[];

/*
 * Flat-rate zones of the fallback estimate (shipping research, "Recommended MVP checkout" item 3):
 * A — Nova Post network countries, B — the other EU countries (courier to the address), C — Switzerland.
 */
export const DELIVERY_ZONES = ["A", "B", "C"] as const;

export type DeliveryZone = (typeof DELIVERY_ZONES)[number];

export function zoneOf(country: DeliveryCountry): DeliveryZone {
  if (country === SWITZERLAND) return "C";
  return (NETWORK_COUNTRIES as readonly string[]).includes(country) ? "A" : "B";
}

// Branches, lockers and pick-up points exist only in the network countries; everywhere delivery to the address works
export function hasDivisions(country: DeliveryCountry): boolean {
  return zoneOf(country) === "A";
}
