"use server";

import { z } from "zod";

export type AddToCartResult = { ok: true } | { ok: false; reason: "invalid" };

const addToCartInput = z.object({ productId: z.uuid() });

/**
 * Stub until the cart lands (#20): validates the input like the real action will and stores nothing.
 * Adding to the cart needs no account (guest checkout, D12), so there is no user or role to check.
 */
export async function addToCart(input: unknown): Promise<AddToCartResult> {
  const parsed = addToCartInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return { ok: true };
}
