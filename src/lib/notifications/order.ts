import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import type { Currency } from "@/lib/money/currencies";
import type { Database } from "@/lib/supabase/database.types";

// An order as the notifications render it: the snapshot stored with the request (src/lib/orders), never priced
// again. Pure: the store (./store.ts) reads it, the templates (./telegram.ts, src/emails) render it.

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type DeliveryMethod = "warehouse" | "postomat" | "doors" | "division" | "address";

/** Where the parcel goes, as the customer chose it: a carrier's point, or an address for the courier. */
export type Destination =
  | { kind: "point"; place: string; point: string }
  | { kind: "address"; place: string; postCode: string | null; street: string; house: string; flat: string | null };

export type DeliveryEstimate =
  | { state: "amount"; currency: Currency; amountMinor: number; decimals: number }
  | { state: "tbd" }
  | { state: "unavailable" };

export type NotificationOrderLine = {
  title: string;
  titleLocale: string;
  quantity: number;
  lineMinor: number;
};

export type NotificationOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  createdAt: string;
  locale: Locale;
  firstName: string;
  lastName: string | null;
  phone: string;
  email: string;
  comment: string | null;
  country: string;
  carrier: "nova_poshta" | "nova_post";
  method: DeliveryMethod;
  // null when the stored shape is not one this code knows: the message then names the method only
  destination: Destination | null;
  estimate: DeliveryEstimate;
  currency: Currency;
  decimals: number;
  totalMinor: number;
  totalUsdMinor: number;
  lines: NotificationOrderLine[];
};

const text = z.string().trim().min(1);
const optional = z.string().trim().min(1).nullish();

// The shapes src/lib/checkout/delivery.ts (deliveryRecord) stores in orders.delivery_destination
const novaPoshtaPoint = z.object({ city: z.object({ label: text }), warehouse: z.object({ name: text }) });
const novaPoshtaAddress = z.object({
  city: z.object({ label: text }),
  street: z.object({ label: text }),
  house: text,
  flat: optional,
});
const novaPostPoint = z.object({ settlement: z.object({ name: text }), division: z.object({ name: text, address: z.string().nullish() }) });
const novaPostAddress = z.object({ city: text, postCode: text, street: text, building: text, flat: optional });

/** The stored destination of an order in one shape for every carrier, or null when it cannot be read. */
export function parseDestination(carrier: string, method: string, value: unknown): Destination | null {
  if (carrier === "nova_poshta" && (method === "warehouse" || method === "postomat")) {
    const parsed = novaPoshtaPoint.safeParse(value);
    return parsed.success ? { kind: "point", place: parsed.data.city.label, point: parsed.data.warehouse.name } : null;
  }
  if (carrier === "nova_poshta" && method === "doors") {
    const parsed = novaPoshtaAddress.safeParse(value);
    if (!parsed.success) return null;
    const { city, street, house, flat } = parsed.data;
    return { kind: "address", place: city.label, postCode: null, street: street.label, house, flat: flat ?? null };
  }
  if (carrier === "nova_post" && method === "division") {
    const parsed = novaPostPoint.safeParse(value);
    if (!parsed.success) return null;
    const { settlement, division } = parsed.data;
    const address = division.address?.trim();
    return { kind: "point", place: settlement.name, point: address ? `${division.name}, ${address}` : division.name };
  }
  if (carrier === "nova_post" && method === "address") {
    const parsed = novaPostAddress.safeParse(value);
    if (!parsed.success) return null;
    const { city, postCode, street, building, flat } = parsed.data;
    return { kind: "address", place: city, postCode, street, house: building, flat: flat ?? null };
  }
  return null;
}
