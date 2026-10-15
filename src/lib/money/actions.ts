"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { CURRENCY_COOKIE, currencies } from "./currencies";

const setCurrencySchema = z.enum(currencies);

export type SetCurrencyResult = { ok: true } | { ok: false; reason: "invalid" };

// The header switcher's choice (D5): a cookie, never the URL. A display preference of any visitor,
// signed in or not, so there is no user or role to check; the value is validated like any other input.
export async function setCurrency(input: unknown): Promise<SetCurrencyResult> {
  const parsed = setCurrencySchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  (await cookies()).set(CURRENCY_COOKIE, parsed.data, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  refresh();
  return { ok: true };
}
