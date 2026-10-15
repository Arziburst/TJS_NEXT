import type { ServiceType } from "./api";
import type { RecipientService } from "./types";

export type { RecipientService };

// D35: the shop ships from Kyiv (the delivery-city Ref of Kyiv in the Nova Poshta dictionary)
export const SENDER_CITY_REF = "8d5a980d-391c-11dd-90d9-001a92567626";

// D35: the recipient pays the delivery on receipt; the site only shows an estimate
export const PAYER = "Recipient";

// D37: parcels are handed in at a Nova Poshta branch in Kyiv
export const SENDER_SERVICE = "Warehouse";

// D37: packaging varies, so quotes are estimates on a small box of 10 × 10 × 5 cm that adds 100 g
export const PACKAGING_WEIGHT_GRAMS = 100;
export const PACKAGING_BOX_CM = { length: 10, width: 10, height: 5 } as const;
export const PACKAGING_VOLUME_CM3 = PACKAGING_BOX_CM.length * PACKAGING_BOX_CM.width * PACKAGING_BOX_CM.height;

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
 * The parcel of a cart: the products' weight plus the box (D37) and its declared value, which is the order
 * total in UAH (D35). Null when a line holds an impossible number.
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
