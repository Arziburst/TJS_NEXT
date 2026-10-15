import type { ServiceType } from "./api";
import type { RecipientService } from "./types";

export type { RecipientService };

// D35: the shop ships from Kyiv (the delivery-city Ref of Kyiv in the Nova Poshta dictionary)
export const SENDER_CITY_REF = "8d5a980d-391c-11dd-90d9-001a92567626";

// D35: the recipient pays the delivery on receipt; the site only shows an estimate
export const PAYER = "Recipient";

// TBD (owner, question in #22): whether the shop hands parcels in at a branch ("Warehouse") or has them
// picked up by a courier ("Doors"); the quote assumes a branch until decided
export const SENDER_SERVICE: "Warehouse" | "Doors" = "Warehouse";

// TBD (owner, question in #22): the packaging (box or envelope, its weight and size); none until decided
export const PACKAGING_WEIGHT_GRAMS = 0;

// The API bills at least 0.1 kg and refuses a weight of 0 (catalog weights default to 0)
export const NP_MIN_WEIGHT_GRAMS = 100;


export function serviceType(recipient: RecipientService): ServiceType {
  const recipientSide = recipient === "warehouse" ? "Warehouse" : recipient === "postomat" ? "Postomat" : "Doors";
  return `${SENDER_SERVICE}${recipientSide}`;
}

export type Parcel = { weightGrams: number; declaredValueMinor: number };

export type CartLine = {
  // the product's weight (products.weight_g)
  weightGrams: number;
  quantity: number;
  // the line's unit price in UAH kopiykas, as the customer is charged (D6)
  unitPriceUahMinor: number;
};

/*
 * The parcel of a cart: its total weight (plus the packaging, TBD) and its declared value, which is the
 * order total in UAH (D35). Null when a line holds an impossible number.
 */
export function parcelFromCart(lines: readonly CartLine[]): Parcel | null {
  let grams = PACKAGING_WEIGHT_GRAMS;
  let value = 0;
  for (const { weightGrams, quantity, unitPriceUahMinor } of lines) {
    if (!(weightGrams >= 0) || !Number.isSafeInteger(quantity) || quantity < 1) return null;
    if (!Number.isSafeInteger(unitPriceUahMinor) || unitPriceUahMinor < 0) return null;
    grams += weightGrams * quantity;
    value += unitPriceUahMinor * quantity;
  }
  const weightGrams = Math.max(NP_MIN_WEIGHT_GRAMS, Math.ceil(grams));
  if (!Number.isSafeInteger(weightGrams) || !Number.isSafeInteger(value)) return null;
  return { weightGrams, declaredValueMinor: value };
}
