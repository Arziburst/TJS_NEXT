"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { removeLine, setLineQuantity } from "@/lib/cart/lines";
import { changeCart, readProductForCart, type MutationFailure } from "@/lib/cart/mutations";

// Every action is a public entry point: the input is validated here, the visitor is re-read from the session
// by changeCart, and a product's kind and availability come from the database, never from the client.

// variants come with #66; until then a line never names one
const lineInput = z.object({ productId: z.uuid(), variantId: z.null().optional() });
const quantityInput = lineInput.extend({ quantity: z.number().int().min(1) });

export type UpdateQuantityResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "unavailable" | "notInCart" | "invalidQuantity" | MutationFailure };

/** Sets the quantity of a line: made-to-order work 1..10 (D36); a one-of-a-kind piece stays at 1. */
export async function updateCartQuantity(input: unknown): Promise<UpdateQuantityResult> {
  const parsed = quantityInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const ref = { productId: parsed.data.productId, variantId: null };

  const outcome = await changeCart<undefined, "unavailable" | "notInCart" | "invalidQuantity" | "unexpectedError">(async (lines) => {
    const product = await readProductForCart(ref.productId);
    if (product === "error") return { refused: "unexpectedError" };
    if (!product || product.availability !== "available") return { refused: "unavailable" };
    const set = setLineQuantity(lines, ref, parsed.data.quantity, product.fulfillment);
    if (!set.ok) return { refused: set.reason };
    return { lines: set.lines, result: undefined };
  });
  if (!outcome.ok) return outcome;
  refresh();
  return { ok: true };
}

export type RemoveFromCartResult = { ok: true } | { ok: false; reason: "invalid" | MutationFailure };

/** Removes a line, whatever its product's state (an unavailable piece can always be removed). */
export async function removeFromCart(input: unknown): Promise<RemoveFromCartResult> {
  const parsed = lineInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const ref = { productId: parsed.data.productId, variantId: null };

  const outcome = await changeCart<undefined, never>(async (lines) => ({ lines: removeLine(lines, ref), result: undefined }));
  if (!outcome.ok) return outcome;
  refresh();
  return { ok: true };
}

export type MergeGuestCartResult = { ok: true } | { ok: false; reason: MutationFailure };

/**
 * Writes a guest cart left from before the sign-in into the account and clears the cookie (the header calls it
 * once it sees both). Idempotent; for a guest it changes nothing.
 */
export async function mergeGuestCart(): Promise<MergeGuestCartResult> {
  const outcome = await changeCart<undefined, never>(async (lines) => ({ lines, result: undefined }));
  if (!outcome.ok) return outcome;
  refresh();
  return { ok: true };
}
