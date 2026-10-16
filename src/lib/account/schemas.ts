import { z } from "zod";
import { locales } from "@/i18n/routing";
import { deliverySchema, EMAIL_MAX_LENGTH, NAME_MAX_LENGTH, normalizePhone, PHONE_PATTERN, type DeliveryChoice } from "@/lib/checkout/schema";

// The account's forms as their Server Actions receive them. Shared by the forms (field limits) and the actions
// (which validate everything again); no "server-only" here.

// Technical (coordinator): how many delivery destinations a customer keeps. The database refuses more
// (supabase/migrations/…_customer_account.sql, the saved_addresses trigger).
export const SAVED_ADDRESSES_MAX = 5;
export const ADDRESS_LABEL_MAX_LENGTH = 50;
// Technical: order requests per page of the order history
export const ORDERS_PAGE_SIZE = 10;

export { EMAIL_MAX_LENGTH, NAME_MAX_LENGTH };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

export const profileSchema = z.object({
  locale: z.enum(locales),
  firstName: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  lastName: optionalText(NAME_MAX_LENGTH),
  // optional on the profile (a Google account has none); the order request asks for it
  phone: z
    .string()
    .transform(normalizePhone)
    .pipe(z.union([z.literal(""), z.string().regex(PHONE_PATTERN)]))
    .transform((value) => value || null),
});

export type ProfileField = "firstName" | "lastName" | "phone";

export const emailChangeSchema = z.object({
  locale: z.enum(locales),
  email: z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email()),
});

export const newAddressSchema = z.object({
  label: optionalText(ADDRESS_LABEL_MAX_LENGTH),
  delivery: deliverySchema,
});

export type NewAddressInput = z.input<typeof newAddressSchema>;

export const addressIdSchema = z.object({ id: z.uuid() });

/** The country of a delivery choice: Ukraine for Nova Poshta, the chosen one abroad. */
export function countryOf(choice: DeliveryChoice): string {
  return choice.kind === "novaPoshtaWarehouse" || choice.kind === "novaPoshtaAddress" ? "UA" : choice.country;
}

/** The fields of a failed profile parse, in form order. */
export function invalidProfileFields(error: z.ZodError): ProfileField[] {
  const order: ProfileField[] = ["firstName", "lastName", "phone"];
  const named = new Set(error.issues.map((issue) => issue.path[0]));
  return order.filter((field) => named.has(field));
}
