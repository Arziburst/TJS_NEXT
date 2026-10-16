"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { addLine } from "@/lib/cart/lines";
import { changeCart, readProductForCart, refuseLine, type MutationFailure } from "@/lib/cart/mutations";

type AddRefusal = "unavailable" | "variantRequired" | "alreadyInCart" | "maxQuantity" | "cartFull" | "unexpectedError";

export type AddToCartResult = { ok: true; quantity: number } | { ok: false; reason: "invalid" | AddRefusal | MutationFailure };

const addToCartInput = z.object({ productId: z.uuid(), variantId: z.uuid().nullable().default(null) });

/**
 * Adds one piece to the visitor's cart (a guest's cookie or the signed-in cart). Needs no account (guest
 * checkout, D12); the visitor is re-read from the session by the cart itself. The product's availability, kind
 * and variants come from the database: a product with variants takes one of its sizes that can be ordered (#66),
 * each size its own line; a one-of-a-kind piece is added once, made-to-order work up to 10 per line (D36).
 */
export async function addToCart(input: unknown): Promise<AddToCartResult> {
  const parsed = addToCartInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const ref = { productId: parsed.data.productId, variantId: parsed.data.variantId };

  const outcome = await changeCart<number, AddRefusal>(async (lines) => {
    const product = await readProductForCart(ref.productId);
    if (product === "error") return { refused: "unexpectedError" };
    const refused = refuseLine(product, ref.variantId);
    if (refused || !product) return { refused: refused ?? "unavailable" };
    const added = addLine(lines, ref, product.fulfillment);
    if (!added.ok) return { refused: added.reason };
    return { lines: added.lines, result: added.quantity };
  });
  if (!outcome.ok) return outcome;
  refresh();
  return { ok: true, quantity: outcome.result };
}
