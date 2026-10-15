"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { addLine } from "@/lib/cart/lines";
import { changeCart, readProductForCart, type MutationFailure } from "@/lib/cart/mutations";

type AddRefusal = "unavailable" | "alreadyInCart" | "maxQuantity" | "cartFull" | "unexpectedError";

export type AddToCartResult = { ok: true; quantity: number } | { ok: false; reason: "invalid" | AddRefusal | MutationFailure };

// variants come with #66; until then a line never names one
const addToCartInput = z.object({ productId: z.uuid(), variantId: z.null().optional() });

/**
 * Adds one piece to the visitor's cart (a guest's cookie or the signed-in cart). Needs no account (guest
 * checkout, D12); the visitor is re-read from the session by the cart itself. The product's availability
 * and kind come from the database: a one-of-a-kind piece is added once, made-to-order work up to 10 (D36).
 */
export async function addToCart(input: unknown): Promise<AddToCartResult> {
  const parsed = addToCartInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const ref = { productId: parsed.data.productId, variantId: null };

  const outcome = await changeCart<number, AddRefusal>(async (lines) => {
    const product = await readProductForCart(ref.productId);
    if (product === "error") return { refused: "unexpectedError" };
    if (!product || product.availability !== "available") return { refused: "unavailable" };
    const added = addLine(lines, ref, product.fulfillment);
    if (!added.ok) return { refused: added.reason };
    return { lines: added.lines, result: added.quantity };
  });
  if (!outcome.ok) return outcome;
  refresh();
  return { ok: true, quantity: outcome.result };
}
