import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";

// The delivery pieces are client components: they get only the texts they use.
export async function DeliveryMessages({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return <NextIntlClientProvider messages={{ checkout: { delivery: messages.checkout.delivery } }}>{children}</NextIntlClientProvider>;
}
