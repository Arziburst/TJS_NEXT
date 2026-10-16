import { deliverySchema, type DeliveryChoice, type DeliveryChoiceInput } from "@/lib/checkout/schema";

// No "server-only": pure helpers, unit-tested.

/**
 * A delivery choice as it was stored (a saved address, an order), or null when it no longer reads as one. The
 * stored form is the parsed one, where an empty flat became null; the schema takes the form's text again.
 */
export function parseStoredChoice(value: unknown): DeliveryChoice | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const stored = value as Record<string, unknown>;
  const parsed = deliverySchema.safeParse("flat" in stored && stored.flat === null ? { ...stored, flat: "" } : stored);
  return parsed.success ? parsed.data : null;
}

/** A stored choice as the checkout form sends it again (an empty flat is text there). */
export function toChoiceInput(choice: DeliveryChoice): DeliveryChoiceInput {
  if (choice.kind === "novaPoshtaAddress" || choice.kind === "novaPostAddress") return { ...choice, flat: choice.flat ?? "" };
  return choice;
}

/**
 * The delivery choice of a stored order (orders.delivery_carrier / delivery_method / country /
 * delivery_destination, as src/lib/checkout/delivery.ts deliveryRecord wrote it), or null when it does not
 * read as one.
 */
export function choiceFromOrder(order: { carrier: string; method: string; country: string; destination: unknown }): DeliveryChoice | null {
  if (typeof order.destination !== "object" || order.destination === null || Array.isArray(order.destination)) return null;
  const destination = order.destination as Record<string, unknown>;
  if (order.carrier === "nova_poshta") {
    return parseStoredChoice({ kind: order.method === "doors" ? "novaPoshtaAddress" : "novaPoshtaWarehouse", ...destination });
  }
  if (order.carrier === "nova_post") {
    return parseStoredChoice({
      kind: order.method === "division" ? "novaPostDivision" : "novaPostAddress",
      country: order.country,
      ...destination,
    });
  }
  return null;
}
