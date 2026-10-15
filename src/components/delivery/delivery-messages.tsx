import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";

// The delivery pieces are client components: they get only the texts they use (and the shop's one "too many
// attempts" text, shared with the auth forms).
export async function DeliveryMessages({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      messages={{
        checkout: { delivery: messages.checkout.delivery },
        auth: { errors: { rateLimited: messages.auth.errors.rateLimited } },
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
