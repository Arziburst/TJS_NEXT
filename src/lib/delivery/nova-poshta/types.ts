// The Nova Poshta shapes the server hands to the delivery UI (src/components/delivery). Types only, safe in
// client code; the client that fills them is server-only (./api).

export type Settlement = {
  // the settlement (searchSettlementStreets, getWarehouses)
  ref: string;
  // its delivery city (getDocumentPrice)
  cityRef: string;
  name: string;
  // "м. Київ, Київська обл."
  label: string;
  area: string;
  region: string;
  warehouseCount: number;
  addressDelivery: boolean;
};

export type WarehouseKind = "branch" | "postomat";

export type WarehouseFilter = "all" | WarehouseKind;

export type Warehouse = {
  ref: string;
  number: number;
  kind: WarehouseKind;
  typeRef: string;
  // "Відділення №1: вул. Пирогівський шлях, 135"
  name: string;
  shortAddress: string;
  cityRef: string;
  settlementRef: string;
  // the heaviest parcel it takes, in kg; null when the API names no limit
  maxWeightKg: number | null;
};

export type Street = {
  ref: string;
  name: string;
  // "вул. Хрещатик"
  label: string;
};

// how the parcel reaches the recipient
export type RecipientService = "warehouse" | "postomat" | "doors";

// invalid: the request did not validate; invalidQuery: the API refuses the text (Latin letters); rateLimited:
// the client asked too often (src/lib/delivery/rate-limit.ts)
export type SearchResult<T> =
  | { ok: true; items: T[] }
  | { ok: false; reason: "invalid" | "invalidQuery" | "rateLimited" | "unavailable" };

// costMinor: the estimate in UAH kopiykas (the recipient pays on receipt, D35)
export type QuoteResult = { ok: true; costMinor: number } | { ok: false; reason: "invalid" | "rateLimited" | "unavailable" };
