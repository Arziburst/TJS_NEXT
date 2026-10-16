import { z } from "zod";
import { locales } from "@/i18n/routing";
import { DELIVERY_COUNTRIES, hasDivisions } from "@/lib/delivery/nova-post/countries";
import { DIVISION_CATEGORIES } from "@/lib/delivery/nova-post/types";

// The order request as the checkout form sends it: who orders and where it goes. No price, weight or total:
// the server builds every number from the cart in the database (src/lib/checkout/quote.ts). Shared by the form
// (its field checks) and the Server Action (which validates everything again); no "server-only" here.

// Field limits (technical): the database checks the same bounds (supabase/migrations/…_orders.sql)
export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 254;
export const COMMENT_MAX_LENGTH = 1000;

// E.164 like the profile's phone: "+" and 8 to 15 digits; spaces, dashes, dots and brackets are dropped first
export const PHONE_PATTERN = /^\+[1-9][0-9]{7,14}$/;

export function normalizePhone(value: string): string {
  return value.replace(/[\s\-().]/g, "");
}

const requiredName = z.string().trim().min(1).max(NAME_MAX_LENGTH);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

export const contactSchema = z.object({
  firstName: requiredName,
  lastName: optionalText(NAME_MAX_LENGTH),
  phone: z.string().transform(normalizePhone).pipe(z.string().regex(PHONE_PATTERN)),
  email: z.string().trim().max(EMAIL_MAX_LENGTH).pipe(z.email()),
});

export type ContactInput = z.input<typeof contactSchema>;
export type ContactField = keyof ContactInput;

// Nova Poshta refs (the dictionary's GUIDs)
const npRef = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const label = z.string().trim().min(1).max(300);

const npCity = z.object({ ref: npRef, cityRef: npRef, label });

// Where the parcel goes, as the customer chose it in the delivery pieces (src/components/delivery). The names
// travel with the refs so the owner can read the destination; the estimate is computed again on the server.
export const deliverySchema = z.discriminatedUnion("kind", [
  // Ukraine, Nova Poshta: a branch or a parcel locker
  z.object({
    kind: z.literal("novaPoshtaWarehouse"),
    city: npCity,
    warehouse: z.object({
      ref: npRef,
      kind: z.enum(["branch", "postomat"]),
      number: z.number().int().min(0).max(1_000_000),
      name: label,
    }),
  }),
  // Ukraine, Nova Poshta: courier to the address
  z.object({
    kind: z.literal("novaPoshtaAddress"),
    city: npCity,
    street: z.object({ ref: npRef, label }),
    house: z.string().trim().min(1).max(10),
    flat: optionalText(10),
  }),
  // EU / Switzerland, Nova Post: a branch, parcel locker or pick-up point (network countries only)
  z.object({
    kind: z.literal("novaPostDivision"),
    country: z.enum(DELIVERY_COUNTRIES).refine(hasDivisions),
    settlement: z.object({ id: z.number().int().positive(), name: label }),
    division: z.object({
      id: z.number().int().positive(),
      number: z.string().trim().max(50),
      name: label,
      category: z.enum(DIVISION_CATEGORIES),
      address: z.string().trim().max(300),
    }),
  }),
  // EU / Switzerland, Nova Post: courier to the address (the API's addressParts limits)
  z.object({
    kind: z.literal("novaPostAddress"),
    country: z.enum(DELIVERY_COUNTRIES),
    city: z.string().trim().min(1).max(100),
    postCode: z.string().trim().min(2).max(10),
    street: z.string().trim().min(1).max(100),
    building: z.string().trim().min(1).max(100),
    flat: optionalText(10),
  }),
]);

export type DeliveryChoice = z.output<typeof deliverySchema>;
export type DeliveryChoiceInput = z.input<typeof deliverySchema>;

// A line the customer saw on the checkout page: compared with the cart at submit, never used for a price. A
// product with variants is a line per size (#66). The unit price shown (USD cents) only tells the server whether
// the price changed since (a sale that started or ended, #67): the customer then sees the new price first
const expectedLine = z.object({
  productId: z.uuid(),
  variantId: z.uuid().nullable().default(null),
  quantity: z.number().int().min(1).max(999),
  unitUsdMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export const checkoutSchema = z.object({
  // one checkout attempt (crypto.randomUUID in the form): a repeated submit returns the same order
  attempt: z.uuid(),
  locale: z.enum(locales),
  contact: contactSchema,
  delivery: deliverySchema,
  comment: optionalText(COMMENT_MAX_LENGTH),
  expected: z.array(expectedLine).min(1).max(50),
});

export type CheckoutInput = z.input<typeof checkoutSchema>;
export type CheckoutRequest = z.output<typeof checkoutSchema>;

// The fields the form shows an error next to
export type CheckoutField = ContactField | "delivery" | "comment";

/** The form fields a failed parse points at; empty when only the hidden parts (attempt, lines) are wrong. */
export function invalidFields(error: z.ZodError): CheckoutField[] {
  const fields = new Set<CheckoutField>();
  for (const issue of error.issues) {
    const [head, field] = issue.path;
    if (head === "contact" && typeof field === "string" && field in contactSchema.shape) fields.add(field as ContactField);
    else if (head === "comment" || head === "delivery") fields.add(head);
  }
  return [...fields];
}
