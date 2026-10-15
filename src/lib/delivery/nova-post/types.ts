import type { DeliveryCountry } from "./countries";

// The division categories a customer can collect a parcel at (CargoBranch is for freight, not offered)
export const DIVISION_CATEGORIES = ["PostBranch", "Postomat", "PUDO"] as const;

export type DivisionCategory = (typeof DIVISION_CATEGORIES)[number];

export type Settlement = {
  id: number;
  name: string;
  // district and region, when the API gives them ("Wrocław County, Lower Silesian voivodeship")
  region: string | null;
};

export type Division = {
  id: number;
  number: string;
  name: string;
  category: DivisionCategory;
  address: string;
};

// Where the parcel goes: a division (branch, locker, pick-up point) or a courier delivery to the address
export type Destination =
  | { kind: "division"; divisionId: number }
  | {
      kind: "address";
      city: string;
      postCode: string;
      street: string;
      building: string;
      flat?: string;
    };

// The parcel to quote. Weight, size and declared value are the caller's: their rules are the owner's (TBD).
export type Parcel = {
  weightGrams: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  // the invoice's declared value (customs), in minor units of `declaredCurrency`
  declaredValueMinor: number;
  declaredCurrency: string;
  // the insured value; the API takes it in the sender's currency (UAH), minor units
  insuranceUahMinor: number;
};

export type QuoteRequest = {
  country: DeliveryCountry;
  destination: Destination;
  parcel: Parcel;
};

// A carrier price in minor units (2 decimals: every currency the API quotes in here has them)
export type CarrierMoney = { currency: string; amountMinor: number };

export type CarrierQuote = {
  price: CarrierMoney;
  // ISO 8601 date-time, null when the API cannot schedule the route
  scheduledDeliveryDate: string | null;
};

export type NovaPostFailure =
  | { kind: "timeout" }
  | { kind: "network"; detail: string }
  // the API key was refused or the JWT expired and could not be renewed
  | { kind: "unauthorized"; status: number }
  // 429: the per-minute limit
  | { kind: "rateLimited" }
  | { kind: "http"; status: number; detail: string }
  // the answer does not match the documented shape
  | { kind: "invalidResponse"; detail: string };

export type NovaPostResult<T> = { ok: true; data: T } | { ok: false; error: NovaPostFailure };
